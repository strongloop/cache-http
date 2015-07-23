# Cached HTTP Client for Node.JS

A Node.JS that adds a transparent cacheing layer to http and https clients.

## Installation

    $ npm install --save cache-http

## Documentation

This is a drop-in replacement for Node's http(s) client. Very little code will
need to change to support cacheing.

```javascript
var cachedHttp = new require('cache-http')('http');
var options = {
  host: <hostname>,
  port: <port>,
  path: <path>,
  method: 'GET',
  'x-cacheable': true,
};
cachedHttp.request(options, callback).end();
```

 The first line, the `require` returns a constructor that takes one parameter:
the protocol it is wrapping. Only `http` and `https` are supported.

Only the http(s) `GET` method is supported. Other methods don't really make much
sense to cache.

In order to activate cacheing for any particular request, the `"x-cacheable"`
option must be specified. Otherwise, this module will bypass the cacheing
feature. The cache keys are built from authorization key, method, host, port,
and path(including parameters). If this is not sufficient to guarantee
uniqueness it is best to disable cacheing for that request.

If there is cached data for a request, this cache will always check for new data
using the `If-Modified-Since` header. If the server reports an HTTP `304`, it'll
return cached data. If the data came from cache, it'll have the `x-cached`
response header.

## Testing

The test script is comprehensive. It includes an HTTP server to test against
(`test-bench`), test cases against this test bench, plus many tests against the
`cached-http` as well. These test cases require Mocha to run.

    $ cd test $ mocha all.js

Note that some test cases take some time to run and will therefore generate
warnings, but they will ultimately pass. Test cases that are meant to take some
are clearly marked with the approximate time they are expected to take.
