
var NodeCache = require('node-cache'),
	_ = require('lodash'),
	Readable = require('stream').Readable,

	cache = new NodeCache();

	defaultCacheTtl = 3600; // default value, pass as cacheTtl option to CachedTransportConstructor

global.cachedTransport || (global.cachedTransport = new NodeCache());



/**
	Cached data is meant to mimic an HTTP transfer so it need to captuire the following information

	{	headers: {},
		rawHeaders: []
		httpVersion: {},
		trailers: {},
		rawTrailers: [],  // up to here, these are copied from the IncomingMessage object

		data: "dataString"
	}

 */
function CachedTransport(transportProtocol, options) {

	options || (options = {});

	var transport = require(transportProtocol),
		cacheTtl = (undefined === options.cacheTtl || null === options.cacheTtl) ? 
					defaultCacheTtl : options.cacheTtl,
		cachedTransport = {};

	_.mixin(cachedTransport, transport);

	cachedTransport.request = function(options, cb) {

		if(options.cacheable && _.includes(["GET", "HEAD"], options.method)) {

			var cachedRequest = transport.request(options),

				endConditions = {		// poor man's promise - track when I can call "end" on http.request
					cacheChecked: false,	// true if the cache has been checked
					endCalled: false
				},

				isCached = true,		// set to false if the data is confirmed not to be cached

				cacheKey = '',
				superEnd = cachedRequest.end,
				onResponses = null,
				onReady = [],
				response = null,
				
				checkReady = function(fn) {
					if(typeof fn === 'function') {
						if(onReady) {
							onReady.push(fn);
						} else {
							fn();
						}
					}
					if(onReady && _.all(endConditions)) {
						while(onReady.length > 0) {
							onReady.pop()();
						}
						onReady = null;
						return true;
					}
					return false;
				};

			cachedRequest.end = function(data, encoding, callback) {
				var sendEnd = _.bind(function() {
					_.bind(superEnd, this)(data, encoding, callback);
				}, this);
				endConditions.endCalled = true;
				checkReady(sendEnd);
			};

			cachedRequest.on('response', function(res) {
				response = res;
				checkReady(function() {
					(!isCached) && cb && cb(res);
				});
			});

			// check the cache
			options.headers && options.headers.authorization && (cacheKey+=options.headers.authorization);
			cacheKey += ':'+options.method;
			cacheKey += ':'+options.port;
			cacheKey += ':'+options.path;

			cache.get(cacheKey, function(err, cachedValue) {

				if(err || (undefined === cachedValue)) {

					// make the request -- capture the data as it's coming in, and pass the http.IncomingMessage 
					// back in a callback

					isCached = false;

				} else {

					cachedRequest.setHeader('if-modified-since', cachedValue.headers['last-modified']);
	
				}

				// check for new data. If exists, return the cached copy, if not, return the new data and capture it.

				endConditions.cacheChecked = true;
				checkReady();

				var onResponse = function(res) {

					if(304 == res.statusCode) {

						// return the cached value, as an http.IncomingMessage lookalike

						// create a readable with the data
						var cachedRes = new Readable();
						cachedRes._read = function noop() {}; 

						// add data from cache, except data
						var resPriorityProps = 
								['statusCode', 'statusMessage', 'headers', 'rawHeaders', 'trailers', 'rawTrailers']
						_.assign(cachedRes, 
							_.pick(res, resPriorityProps), 
							_.omit(cachedValue, ['data'].concat(resPriorityProps)));
						cachedRes.cachedProps = _.pick(cachedValue, resPriorityProps);

						// add a header to mark the item as having been retreived from cache
						cachedRes.headers["x-cached"] = true;
						cachedRes.statusCode = 304;

						res.on('data', function() {
							console.log('134: 304 data');
						});

						res.on('end', function() {
							// push data into the stream
							cachedRes.push(cachedValue.data);
							cachedRes.push(null); // indicates EOF
						});

						cb && cb(cachedRes);

					} else {

						interceptResponse({
									cacheTtl: cacheTtl,
									cacheKey: cacheKey
								}, res);
						_.defer(function() {
							isCached && cb && cb(res);
						});
					}

				};
				if(null != response) {
					onResponse(response)
				} else {
					cachedRequest.on('response', function() {
						onResponse(response);
					});
				}
			});

			return cachedRequest;

		} else {

			return transport.request(options, cb);

		}

	}

	return cachedTransport;

}

function checkCache(parms, isCached, isNotCached) {

}

/**
	Parms has the following in it:
		cacheKey: the key of the cache
		cacheTtl: the time-to-live of the cache value
		cache: the cache
 */

function interceptResponse(parms, res) {

	// only cache if the last-modified header is set.
	if(res.headers['last-modified']) {

		var cacheObj = {data:''};
		res.on('end', function() {

			// commit to cache
			_.extend(cacheObj, _.pick(res, [
					'headers', 'rawHeaders', 'httpVersion', 'trailers', 'rawTrailers',
					'method', 'url']));

			cache.set(parms.cacheKey, cacheObj, parms.cacheTtl);

		});

		res.on('data', function(chunk) {
			cacheObj.data += chunk;
		});

	}

}


module.exports = CachedTransport;

