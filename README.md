# Development Environment Simulator

This tool simulates web app running environment by running a "man in the middle" proxy that rewrites or bridges requests to any environment you choose. It enables you to develop and test local module as part of the whole infrastructure in targetting environment.

## Installation

### From NPM

* `npm install env-is-on`

### From source
* Git clone this repo
* `npm install` all packages
* run `node ./`

## Usage
* Run `env-is-on -m [path to mapping config] -b [path to bridging config] -p [the port you name it]`, e.g `env-is-on -b ./bridges/my-app`
* Open `.http-mitm-proxy/ca.pem` and trust this root ca. 
* Set your browser's proxy to localhost:[the port you have specified]

### Arguments

* -mapping, -m: path to a folder contains mapping files
* -bridges, -b: path to a bridge file
* -avoid-mapping-when-bridged, -a: default to `true`, mapping file will be executed the request has been bridged.

## Bridge and Mapping

Bridge is simple request redirection between 2 different origins while mapping can do much more complex stuffs such as replace page content.

### Bridge Config 

```javascript
module.exports = [{
  from: {
    host: 'example.com',
    pathname: /^\/api\/(?!endpoint\/)/,
  },
  to: {
    pathname: '/',
    protocol: 'http:',
    host: 'localhost',
    port: 3000
  }
},{
  from: {
    host: 'example.com',
    pathname: '/api/endpoint/',
  },
  to: {
    pathname: '/api/version1.3/endpoint/',
    protocol: 'https:',
    host: 'example.com',
    port: 443
  }
},{
  // config for react sockjs request to passthrough
  from: {
    host: 'example.com',
    pathname: '/sockjs-node/',
    referer: 'https://example.com/1/admin/',
    port: 3000
  },
  to: {
    pathname: '/sockjs-node/',
    protocol: 'http:',
    host: 'localhost',
    port: 3000
  }
}];
```

### Mapping 

TODO