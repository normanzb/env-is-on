#!/usr/bin/env node

'use strict';

const path = require('path');
const Proxy = require('http-mitm-proxy');
const https = require('https');
const parseArgs = require('minimist');
const includeAll = require('include-all');
const REQU_CHUNK_ARRAY_KEY = '#$requ_chunks';
const RESP_CHUNK_ARRAY_KEY = '#$resp_chunks';
const REPLACE_KEY = '#!update_response_headers';
const PROXY_PORT = 3001;

var args = parseArgs(process.argv.slice(2), {
    alias: {
        'mappings': 'm',
        'bridges': 'b',
        'port': 'p'
    },
    default: {
        'port': PROXY_PORT
    }
});

var mappings;
var bridges = [];

if (args.mappings) {
  mappings = includeAll({
    dirname: path.join(__dirname, args.mappings),
    filter:  /.*?.js$/,
  });
}
else {
  mappings = [];
}

if (args.bridges) {
  if (Array.isArray(args.bridges) && args.bridges.length > 0) {
    args.bridges.forEach(function(item){
      bridges.push(require(item));
    });
  }
  else {
    bridges.push(require(args.bridges));
  }
}

const replacableMIME = {
  'application/javascript': true,
  'application/json': true,
  'text/css': true,
  'text/html': true
};

function yellow(msg) {
  return `\x1b[33m${msg}\x1b[0m`;
}

function doBridge(bridgeItem, proxyToServerRequestOptions, pathname, query) {
  var isFromPathnameRegExp = bridgeItem.from.pathname instanceof RegExp;
  proxyToServerRequestOptions.protocol = bridgeItem.to.protocol;
  proxyToServerRequestOptions.host = bridgeItem.to.host;
  proxyToServerRequestOptions.port = bridgeItem.to.port;
  proxyToServerRequestOptions.path = pathname.replace(
    isFromPathnameRegExp ? bridgeItem.from.pathname : new RegExp('^' + bridgeItem.from.pathname), 
    bridgeItem.to.pathname
  ) + (query?'?'+query:'');
  console.log('Redirects to:', 
    proxyToServerRequestOptions.host + ':'
    + proxyToServerRequestOptions.port
    + proxyToServerRequestOptions.path);
  proxyToServerRequestOptions.headers.host = proxyToServerRequestOptions.host;
}

function isBridgeItemMatched(bridgeItem, {host, pathname, referer}) {
  var parts = host.split(':');
  host = parts[0];
  var port = parts[1] * 1;

  if (bridgeItem.from.host !== host) {
    return false;
  }

  if (bridgeItem.from.port && bridgeItem.from.port !== port) {
    return false;
  }

  if (bridgeItem.from.referer) {
    if (bridgeItem.from.referer instanceof RegExp) {
      if (!bridgeItem.from.referer.test(referer)) {
        return false;
      }
    } else {
      if (bridgeItem.from.referer + '' !== referer) {
        return false;
      }
    }
  }

  if ((bridgeItem.from.pathname + '') === bridgeItem.from.pathname) {
    if (
      pathname.toLowerCase().indexOf(
        bridgeItem.from.pathname.toLowerCase()
      ) === 0
    ) {
      return true;
    }
  }
  else if (bridgeItem.from.pathname instanceof RegExp) {
    if (bridgeItem.from.pathname.test(pathname)) {
      return true;
    } 
  }

  return false;
}

function startProxy() {
  var proxy = Proxy();

  proxy.onError(function(ctx, err) {
    console.error('proxy error:', err);
  });

  proxy.onRequest(function(ctx, callback) {
    var ctpURL = ctx.clientToProxyRequest.url;
    var pathnameAndQuery = ctpURL.split('?');
    var pathname = pathnameAndQuery[0];
    var query = pathnameAndQuery[1];
    var host = ctx.clientToProxyRequest.headers.host;
    var referer = ctx.clientToProxyRequest.headers.referer;
    var isBridged = false;
    var isMapped = false;

    for(var i = 0; i < bridges.length; i++) {
      let bridge = bridges[i];
      for(var j = 0; j < bridge.length; j++) {
        let bridgeItem = bridge[j];
        
        if (
          isBridgeItemMatched(bridgeItem, {host, pathname, referer})
        ) {
          console.log('Found a bridge:', host, pathname);
          doBridge(bridgeItem, ctx.proxyToServerRequestOptions, pathname, query);
          isBridged = true;
        }
      }
    }

    if (!isBridged) {
      for (var key in mappings) {
        let mapping = mappings[key];

        if (mapping.host === host) {
          ctx.use(Proxy.gunzip);

          if (!ctx.mappingData) {
            ctx.mappingData = {};
          }
          if (!ctx.mappingData[key]) {
            ctx.mappingData[key] = {};
          }

          if (typeof mapping.map === 'function') {
            mapping.map(ctx, ctx.mappingData[key]);
            isMapped = true;
          }

          if (typeof mapping.onRequest === 'function') {
            ctx.mappingData[REQU_CHUNK_ARRAY_KEY] = [];
          }

          if (typeof mapping.onResponse === 'function') {
            ctx.mappingData[RESP_CHUNK_ARRAY_KEY] = [];
          }

          if (typeof mapping.updateResponseHeaders === 'function') {
            ctx.mappingData[REPLACE_KEY] = [];
          }
        }
      }
    }

    if (isBridged || isMapped) {
      if (ctx.proxyToServerRequestOptions.protocol === 'https:') {
        ctx.proxyToServerRequestOptions.agent = proxy.httpsAgent;
      }
      else if (ctx.proxyToServerRequestOptions.protocol === 'http:') {
        ctx.proxyToServerRequestOptions.agent = proxy.httpAgent;
      }
    }

    return callback();
  });

  proxy.onRequestData(function(ctx, chunk, callback){
    if (ctx.mappingData && ctx.mappingData[REQU_CHUNK_ARRAY_KEY]) {
      ctx.mappingData[REQU_CHUNK_ARRAY_KEY].push(chunk);
      callback();
    }
    else {
      callback(null, chunk);
    }
  });

  proxy.onRequestEnd(function(ctx, callback){
    if (ctx.mappingData && ctx.mappingData[REQU_CHUNK_ARRAY_KEY]) {
      var buffer = Buffer.concat(ctx.mappingData[REQU_CHUNK_ARRAY_KEY]);
      var request = buffer.toString();
      var host = ctx.clientToProxyRequest.headers.host;

      for (var key in mappings) {
        let mapping = mappings[key];
        if (mapping.host === host) {
          if (typeof mapping.onRequest === 'function') {
            request = mapping.onRequest(ctx, request, ctx.mappingData[key]);
          }
        }
      }

      ctx.proxyToServerRequest.end(Buffer.from(request));
    }

    callback();
  });

  proxy.onResponseHeaders(function (ctx, callback) {
    if (!ctx.mappingData) {
      callback();
      return;
    }

    var host = ctx.clientToProxyRequest.headers.host;

    if (ctx.mappingData[REPLACE_KEY]) {
      for (var key in mappings) {
        let mapping = mappings[key];
        if (mapping.host === host) {
          if (typeof mapping.updateResponseHeaders === 'function') {
            mapping.updateResponseHeaders(ctx, ctx.serverToProxyResponse.headers);
          }
        }
      }
    }

    if (ctx.mappingData[RESP_CHUNK_ARRAY_KEY]) {
      var contentType = ctx.serverToProxyResponse.headers['content-type'];

      if (!contentType) {
        delete ctx.mappingData[RESP_CHUNK_ARRAY_KEY];
      }
      else {
        contentType = contentType.split(';')[0];
        if (!replacableMIME[contentType]) {
          delete ctx.mappingData[RESP_CHUNK_ARRAY_KEY];
        }
      }
    }
    
    callback();
  });

  proxy.onResponseData(function(ctx, chunk, callback){
    if (ctx.mappingData && ctx.mappingData[RESP_CHUNK_ARRAY_KEY]) {
      ctx.mappingData[RESP_CHUNK_ARRAY_KEY].push(chunk);
      callback();
    }
    else {
      callback(null, chunk);
    }
  });

  proxy.onResponseEnd(function(ctx, callback){
    if (ctx.mappingData && ctx.mappingData[RESP_CHUNK_ARRAY_KEY]) {
      var buffer = Buffer.concat(ctx.mappingData[RESP_CHUNK_ARRAY_KEY]);
      var response = buffer.toString();
      var host = ctx.clientToProxyRequest.headers.host;

      for (var key in mappings) {
        let mapping = mappings[key];
        if (mapping.host === host) {
          if (typeof mapping.onResponse === 'function') {
            response = mapping.onResponse(ctx, response, ctx.mappingData[key]);
          }
        }
      }

      ctx.proxyToClientResponse.end(Buffer.from(response));
    }

    callback();
  });

  proxy.listen({
    httpsAgent: new https.Agent({ 
      keepAlive: false, 
      rejectUnauthorized: false 
    }), 
    port: args.port, 
    timeout: 2147483647
  });

  console.log(yellow(`Proxy server is up on port ${PROXY_PORT}, \n please configure your browser accordingly.`));
  console.log(yellow(`Don't forget to trust the root ca which you can find in ./.http-mitm-proxy/certs/ca.pem`));
}

startProxy();
