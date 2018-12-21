# Development Environment Simulator

Envision helps you simulate web app running environment, essentially it runs a "man in the middle" proxy that rewrites the url, and bridges API requests to any environment you choose, so that you can test your code like it is running on the target environment.

## Installation

### From NPM

* `npm install @normanzb/envision`

### From source
* Git clone this repo
* `npm install` all packages
* run `node ./`

## Usage
* Run `env-sim -m [path to mapping config] -b [path to bridging config] -p [the port you name it]`, e.g `env-sim -b ./bridges/my-app`
* Open `.http-mitm-proxy/ca.pem` and trust this root ca. 
* Set your browser's proxy to localhost:[the port you have specified]

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