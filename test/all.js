
/**
	Test script for the cached http client.

	Creates a test http server, that will respond in a predictable manner, tests that http server, then
	tests my cached client with it.
 */

var _ = require("lodash"),
	fs = require("fs"),
	http = require("http"),
	url = require("url"),

	assert = require('assert'),
	async = require('async'),

	cachedHttp = new require('./../protocols')('http');

	hostOptions = {
		host:'localhost',
		port: 55125,
		method: 'GET'
	},

	date = {
		earlier: new Date('Fri May 22 2015 11:00:00 GMT-0500 (CDT)'),
		baseline: new Date('Fri May 22 2015 12:00:00 GMT-0500 (CDT)'),
		later: new Date('Fri May 22 2015 13:00:00 GMT-0500 (CDT)')
	};


/** 
	Create the server
 	
 	I have some "files":
 		A.html is never modified and provides the Last-Modified header, 
 		B.html is modified on demand and provides the Last-Modified header
 		C is live and but provides a Last-Modified header.
 		D.html doesn't provide a Last-Modified header.
		E.jpg is a binary file and provides the Last-Modified header.

 */

function Server() {

	var files = {
			"A.html": { content: "<html><head><title>File A.html</title><body>This is A.html. " + 
								 "It never changes.</body></html>",
						modified: date.baseline.toString(),
						type: "text/html"
					},
			"B.html": {},
			C 		: function() {
						var now = date.baseline.toString();
						return {
							content: "<html><head><title>File C (live)</title><body>This is C. " + 
								 "It was live updated on " + now + ".</body></html>",
							modified: now,
							type: "text/html"
						}
					},
			"D.html": { content: "<html><head><title>File A.html</title><body>This is D.html. " + 
								 "I have no idea if this changes or not.</body></html>",
						type: "text/html" },
			"E.jpg" : { modified: date.baseline.toString(),
						type: "image/jpeg" },
			F 		: { statusCode: 500 },
			"G.html": { content: "<html><head><title>File G.html " + 
								"</title><body>This is G.html.</body></html>",
						modified: date.baseline.toString(),
						type: "image/jpeg" },
		},

		onReadyActions = [],
		BSequence = 0; // increments every time B is updated


	this.resetB = _.bind(function(optionalCallback) {
		// timeout is necessary or the time stamp may not actually apear to advance.
		files["B.html"] = {
				content: "<html><head><title>File B.html ver." + BSequence + 
								"</title><body>This is B.html version " + BSequence + ".</body></html>",
				modified: date.earlier.toString(),
				type: "text/html"
			};
		BSequence++;
		optionalCallback && optionalCallback();
	}, this);
	this.resetB();

	this.updateB = _.bind(function(optionalCallback) {
		// timeout is necessary or the time stamp may not actually apear to advance.
		files["B.html"] = {
				content: "<html><head><title>File B.html ver." + BSequence + 
						"</title><body>This is B.html version " + BSequence + ".</body></html>",
				modified: date.later.toString(),
				type: "text/html"
			};
		BSequence++;
		optionalCallback && _.defer(function() {optionalCallback(null, true);});
	}, this);


	// Perform an action if and when the server is ready.
	this.ready = function(cb) {
		if(onReadyActions) {
			cb && onReadyActions.push(cb);
		} else {
			cb && _.defer(cb);
		}
	};

	async.parallel(

			[ 	function(cb) {
					fs.readFile("test/E.jpg", function(err, data) {
						if(err) {
							console.log("Could not load E.jpg for testing. Exiting.");
							cb(err);
						} else {
							files["E.jpg"].content = data;
							cb(null, true);
						}
					});
				},

				function(cb) {

					var server = http.createServer(function(request, response) {

						var url = require('url').parse(request.url),
							path = url.pathname.substring(1),
							cancelResponse = false, // set to true to cancel the 200 response.
							file = files[path],
							delay = /delay=(\d+)/.exec(url.query);

						delay = (delay && delay[1]) ? delay[1] : 0;

						if(file) {

							var liveFile = false;
							if(typeof(file) === "function") {
								file = file();
								liveFile = true;
							}

							if(file.statusCode) {
								response.statusCode = file.statusCode;
								cancelResponse = true;
							}

							if(!cancelResponse && file.modified) {
								response.setHeader("Last-Modified", file.modified);
								var ims = request.headers["if-modified-since"];
								if(!liveFile && ims && (new Date(ims)).getTime() >= Date.parse(file.modified)) {
									response.statusCode = 304;
									cancelResponse = true;
								}
							}

							if(!cancelResponse) {
								response.setHeader("Content-Type", file.type);
								response.write(file.content);
							}

						} else {
							response.statusCode = 404;
						}

						setTimeout(function() {
							response.end();
						}, ((delay) || 0));

					});
					server.listen(hostOptions.port);
					cb(null, true);

				}

			], 
			function(err, results) {
				if(!err) {
					async.series(onReadyActions);
					onReadyActions = null;
				}
			}
		);

}
var server = new Server();

/**
 	Test the server

	A should serve a file with the Last-Modified header
	A should serve a file with the same Last-Modified header
	A should serve a 304 if requested with an If-Modified-Since header the same as the Last-Modified header
	A should serve a 304 if requested with an If-Modified-Since header after the Last-Modified header
	A should serve a 200 if requested with an If-Modified-Since header before the Last-Modified header

	B should serve a file with the Last-Modified header
	B should serve a 304 if requested with an If-Modified-Since header the same as the Last-Modified header
	*** update the file
	B should serve a file with a new Last-Modified header
	B should serve a 200 if requested with an If-Modified-Since header the same as the original Last-Modified header
	B should serve a 304 if requested with an If-Modified-Since header the same as the new Last-Modified header
	B should serve a 304 if requested with an If-Modified-Since header after the new Last-Modified header
	B should serve a 200 if requested with an If-Modified-Since header before the new Last-Modified header

	C should serve a file with the Last-Modified header
	C should serve a file with a new Last-Modified header
	C should serve a 200 if requested with an If-Modified-Since header the same as the Last-Modified header

	D should serve a file without the Last-Modified header

	E should serve a file with the Last-Modified header
	Save E and compare it to the original file

 */

describe('start server', function(done) {
	server.ready(done);
});

describe('test-bench', function() {

	var	assertStatus = function(transport, opts, withLastModified, status, callback) {
			var httpOpts = withLastModified ? 
					_.assign({}, opts, 
						{ headers: { "if-modified-since": withLastModified } }
					) :
					opts;
			transport.request(httpOpts, function(res) {
				assert.equal(status, res.statusCode);
				callback();
			}).end();
		},

		delayAssertStatus = function(transport, opts, withLastModified, status, callback) {
			setTimeout(function() {
				assertStatus(transport, opts, withLastModified, status, callback);
			}, 1000);
		}

	describe('A-static-text-file', function() {

		var httpAOpts = _.assign({}, hostOptions, {path: '/A.html'}),
			fileA;

		it('should return a file', function(done) {
			http.request(
				httpAOpts, 
				function(res) {

					var result = { lastModified: res.headers["last-modified"], data: '' };
					res.on('data', function(chunk) {
						result.data += chunk;
					});
					res.on('end', function() {
						fileA = result;
						done();
					});
				}
			).end();
		});

		it('should returns the same values', function(done) {
				http.request(httpAOpts, function(res) {
					var data = '' ;
					res.on('data', function(chunk) {data += chunk;});
					res.on('end', function() {
						assert.equal(fileA.lastModified, res.headers["last-modified"]);
						assert.equal(fileA.data, data);
						done();
					});
				}).end();
			});

		it('should return a 200 when fetching the same file', function(done) {
				assertStatus(http, httpAOpts, null, 200, done);
			});

		it('returns a 304 when fetching with same If-Modified-Since date', function(done) {
				assertStatus(http, httpAOpts, fileA.lastModified, 304, done);
			});

		it('returns a 304 when fetching with later If-Modified-Since date', function(done) {
				assertStatus(http, httpAOpts, date.later.toString(), 304, done);
			});

		it('returns a 200 when fetching with earlier If-Modified-Since date', function(done) {
				assertStatus(http, httpAOpts, date.earlier.toString(), 200, done);
			});

	});

	describe('B-file-with-updates', function() {

		var httpBOpts = _.assign({}, hostOptions, {path: '/B.html'}),
			fileB,
			originalLastModified;

		it('should return a file', function(done) {
			http.request(
				httpBOpts, 
				function(res) {

					var result = { lastModified: res.headers["last-modified"], data: '' };
					originalLastModified = result.lastModified;
					res.on('data', function(chunk) {
						result.data += chunk;
					});
					res.on('end', function() {
						fileB = result;
						done();
					});
				}
			).end();
		});

		it('should return a 200 when fetching the same file', function(done) {
				assertStatus(http, httpBOpts, null, 200, done);
			});

		it('returns a 304 when fetching with same If-Modified-Since date', function(done) {
				assertStatus(http, httpBOpts, fileB.lastModified, 304, done);
			});

		it('should return a 200 after updating the file', function(done) {
			server.updateB(function(){
				http.request(
						httpBOpts, 
						function(res) {

							assert.equal(200, res.statusCode);

							var result = { lastModified: res.headers["last-modified"], data: '' };
							res.on('data', function(chunk) {
								result.data += chunk;
							});
							res.on('end', function() {
								assert.notEqual(fileB.lastModified, result.lastModified);
								assert.notEqual(fileB.data, result.data);
								fileB = result;
								done();
							});

						}
					).end();

				});
			});
		
		it('returns a 200 when fetching with same If-Modified-Since date', function(done) {
				assertStatus(http, httpBOpts, originalLastModified, 200, done);
			});

		it('returns a 304 when fetching with same If-Modified-Since date', function(done) {
				assertStatus(http, httpBOpts, fileB.lastModified, 304, done);
			});

		it('returns a 304 when fetching with later If-Modified-Since date', function(done) {
				assertStatus(http, httpBOpts, date.later.toString(), 304, done);
			});

		it('returns a 200 when fetching with earlier If-Modified-Since date', function(done) {
				assertStatus(http, httpBOpts, date.earlier.toString(), 200, done);
			});
	});

	describe('C-live-file', function() {

		var httpCOpts = _.assign({}, hostOptions, {path: '/C'}),
			fileC,
			originalLastModified;

		it('should return a file', function(done) {
			http.request(
				httpCOpts, 
				function(res) {

					var result = { lastModified: res.headers["last-modified"], data: '' };
					originalLastModified = result.lastModified;
					res.on('data', function(chunk) {
						result.data += chunk;
					});
					res.on('end', function() {
						fileC = result;
						done();
					});

				}
			).end();
		});

		it('should return a 200 when fetching the same file', function(done) {
				assertStatus(http, httpCOpts, null, 200, done);
			});

		it('returns a 200 when fetching with same If-Modified-Since date', function(done) {
				assertStatus(http, httpCOpts, originalLastModified, 200, done);
			});

	});

	describe('D-no-last-modified-header', function() {

		var httpDOpts = _.assign({}, hostOptions, {path: '/D.html'}),
			fileD,
			originalLastModified;

		it('should return a file with no last-modified header', function(done) {
			http.request(
				httpDOpts, 
				function(res) {


					assert.equal(res.headers["last-modified"], undefined);
					done();

				}
			).end();
		});

	});

	// E should serve a file with the Last-Modified header
	// Save E and compare it to the original file

	describe('E-binary-file', function() {

		var httpEOpts = _.assign({}, hostOptions, {path: '/E.jpg'}),
			fileE;

		it('should ... [TODO]', function(done) {
			// TODO
			done();
		});

	});

	describe('F-no-file', function() {

		var httpFOpts = _.assign({}, hostOptions, {path: '/F.html'}),
			fileE;

		it('should return a 404', function(done) {
			http.request(
				httpFOpts, 
				function(res) {
					assert.equal(res.statusCode, 404);
					done();

				}
			).end();
		});

	});

	describe('F-server-error', function() {

		var httpFOpts = _.assign({}, hostOptions, {path: '/F'}),
			fileE;

		it('should return a 500', function(done) {
			http.request(
				httpFOpts, 
				function(res) {
					assert.equal(res.statusCode, 500);
					done();

				}
			).end();
		});

	});
});


/**
	Test the cache

	Request the file in A, should cache the file.
	Request the file in A again, should give a cached copy of the file.

	Request the file in B, should cache the file.
	Request the file in B again, should give a cached copy.
	*** update the file
	Request the file in B again, cache a new file.
	Request the file in B again, should give a cached copy of the new file
	Request the file in B again, but without the cache, should return a new file.

	Request the file in C, should cache a new file.
	Request the file in C again, should cache a new file.
	Request the file in C again, should cache a new file.
	
	Request the file in D, should not cache a new file.

	Request the binary file in E, should cache the file
	Request the binary file in E again, shoud give a cached copy.
	Save that cached copy to disk and compare it to the original.

	Should not cache a POST

	Should not cache or crash on 404 or 500

	Test that http.get uses cachedHttp.request

 */

describe('cache', function() {

	/**
	 *	Checks if a file comes from a cached copy
	 *	@param transport - the cachedTransport to confirm
	 *	@param opts - the http options, including the cacheable option, if applicable
	 *	@param isCached {Boolean|Object} if false, we're confirming it's not cached, if true or an object.
	 *		we're confirming it is cached. Also, if it's an object, we're confirming all the properties in 
	 *		the object match those of the response.
	 */
	var	assertCached = function(transport, opts, isCached, callback) {
			cachedHttp.request(opts, function(res) {
				var data = '';
				res.on('data', function(chunk) {
					data += chunk;
				});
				res.on('end', function() {
					assert.equal(!!(res.headers['x-cached']), !!isCached);
					if(typeof(isCached) === 'object') {
						// compare each property in the isCached object with the downloaded one.
						_.each(_.keys(isCached), function(key) {
							if('data' === key) {
								assert.equal(data, isCached.data);
							} else {
								assert.equal(res[key], isCached[key]);
							}
						});
					}
					callback();
				});
			}).end();
		},

		delayAssertStatus = function(transport, opts, withLastModified, isCached, callback) {
			setTimeout(function() {
				assertStatus(transport, opts, withLastModified, isCached, callback);
			}, 1000);
		}


	describe('A-static-text-file', function() {

		var httpAOpts = _.assign({}, hostOptions, {path: '/A.html', "x-cacheable": true}),
			fileA;

		it('should return a file (no-cache)', function(done) {
				cachedHttp.request(
					_.omit(httpAOpts, ["x-cacheable"]), 
					function(res) {
						var result = { lastModified: res.headers["last-modified"], data: '' };
						res.on('data', function(chunk) {
							result.data += chunk;
						});
						res.on('end', function() {
							fileA = result;
							done();
						});
					}
				).end();
			});

		it('should return a file', function(done) {
				cachedHttp.request(
					httpAOpts, 
					function(res) {

						var result = { lastModified: res.headers["last-modified"], data: '' };
						res.on('data', function(chunk) {
							result.data += chunk;
						});
						res.on('end', function() {
							fileA = result;
							done();
						});
					}
				).end();
			});

		it('should returns the same file but from cache', function(done) {
				cachedHttp.request(httpAOpts, function(res) {
					var data = '' ;
					res.on('data', function(chunk) {
						data += chunk;
					});
					res.on('end', function() {
						assert.equal(res.headers["last-modified"], fileA.lastModified);
						assert.equal(data, fileA.data);
						assert.equal(res.statusCode, 304);
						assert(res.headers["x-cached"]);						
						done();
					});
				}).end();
			});
	});

	describe('B-file-with-updates', function() {

		server.resetB();

		var httpBOpts = _.assign({}, hostOptions, {path: '/B.html', "x-cacheable": true}),
			fileB,
			originalLastModified;

		it('should cache the file', function(done) {
			server.resetB(function() {
					cachedHttp.request(
						httpBOpts, 
						function(res) {

							var result = { lastModified: res.headers["last-modified"], data: '' };
							originalLastModified = result.lastModified;
							res.on('data', function(chunk) {
								result.data += chunk;
							});
							res.on('end', function() {
								fileB = result;
								done();
							});
						}
					).end();
				});
			});


		it('returns a cached copy when requesting the same file', function(done) {
				assertCached(cachedHttp, httpBOpts, {statusCode:304}, done);
			});

		it('returns a new copy of the file after updating it', function(done) {
				server.updateB(function(){
						assertCached(cachedHttp, httpBOpts, false, done);
					});
			});

		it('returns a cached copy of the file', function(done) {
				assertCached(cachedHttp, httpBOpts, {statusCode:304}, done);
			});

		it('returns a cached copy of the file without the cache', function(done) {
				assertCached(cachedHttp, _.omit(httpBOpts, ['x-cacheable']), false, done);
			});


	});

	// Request the file in C, should cache a new file.
	// Request the file in C again, should cache a new file.
	// Request the file in C again, should cache a new file.
	
	describe('C-live-file', function() {

		server.resetB();

		var httpCOpts = _.assign({}, hostOptions, {path: '/C', "x-cacheable": true}),
			fileC,
			originalLastModified;

		it('should cache the file', function(done) {
				cachedHttp.request(
					httpCOpts, 
					function(res) {

						var result = { lastModified: res.headers["last-modified"], data: '' };
						originalLastModified = result.lastModified;
						res.on('data', function(chunk) {
							result.data += chunk;
						});
						res.on('end', function() {
							fileB = result;
							done();
						});
					}
				).end();
			});

		it('returns a new copy of the file', function(done) {
				assertCached(cachedHttp, httpCOpts, false, done);
			});

		it('returns a new copy of the file', function(done) {
				assertCached(cachedHttp, httpCOpts, false, done);
			});

	});


	// Request the file in D, should not cache a new file.

	describe('D-no-last-modified-header', function() {

		server.resetB();

		var httpDOpts = _.assign({}, hostOptions, {path: '/D.html', "x-cacheable": true}),
			fileD,
			originalLastModified;

		it('should not cache the file', function(done) {
				cachedHttp.request(
					httpDOpts, 
					function(res) {

						var result = { lastModified: res.headers["last-modified"], data: '' };
						originalLastModified = result.lastModified;
						res.on('data', function(chunk) {
							result.data += chunk;
						});
						res.on('end', function() {
							fileB = result;
							done();
						});
					}
				).end();
			});

		it('returns a new copy of the file', function(done) {
				assertCached(cachedHttp, httpDOpts, false, done);
			});

		it('returns a new copy of the file', function(done) {
				assertCached(cachedHttp, httpDOpts, false, done);
			});

	});

	// Request the file in D, should not cache a new file.

	describe('Large-web-page', function() {

		var httpOpts = _.assign({}, 
					hostOptions, 
					{	host: 'shakespeare.mit.edu',
						port: 80,
						path: '/romeo_juliet/full.html', 
						"x-cacheable": true
					}),
			fileLarge,
			originalLastModified;

		it('should cache the (~300ms)', function(done) {
				cachedHttp.request(
					httpOpts, 
					function(res) {

						var result = { data: '' };
						originalLastModified = result.lastModified;
						res.on('data', function(chunk) {
							result.data += chunk;
						});
						res.on('end', function() {
							fileLarge = result;
							done();
						});

					}
				).end();
			});

		it('returns a cached copy of the file (~100ms)', function(done) {
				assertCached(cachedHttp, httpOpts, {data:fileLarge.data}, done);
			});

	});

	// Request the binary file in E, should cache the file
	// Request the binary file in E again, shoud give a cached copy.
	// Save that cached copy to disk and compare it to the original.

	// Should not cache a POST
	// Request the file in D, should not cache a new file.
	describe('Do-not-cache-POST', function() {

		server.resetB();

		var httpAOpts = _.assign({}, hostOptions, {method: 'POST', path: '/A.html', "x-cacheable": true}),
			fileA,
			originalLastModified;

		it('should not cache the file', function(done) {
				cachedHttp.request(
					httpAOpts, 
					function(res) {

						var result = { lastModified: res.headers["last-modified"], data: '' };
						originalLastModified = result.lastModified;
						res.on('data', function(chunk) {
							result.data += chunk;
						});
						res.on('end', function() {
							fileA = result;
							done();
						});
					}
				).end();
			});

		it('returns a new copy of the file', function(done) {
				assertCached(cachedHttp, httpAOpts, false, done);
			});

		it('returns a new copy of the file', function(done) {
				assertCached(cachedHttp, httpAOpts, false, done);
			});

	});

	describe('Do-not-cache-unless-asked', function() {

		server.resetB();

		var httpAOpts = _.assign({}, hostOptions, {path: '/A.html'}),
			fileA,
			originalLastModified;

		it('should not cache the file', function(done) {
				cachedHttp.request(
					httpAOpts, 
					function(res) {

						var result = { lastModified: res.headers["last-modified"], data: '' };
						originalLastModified = result.lastModified;
						res.on('data', function(chunk) {
							result.data += chunk;
						});
						res.on('end', function() {
							fileA = result;
							done();
						});
					}
				).end();
			});

		it('returns a new copy of the file', function(done) {
				assertCached(cachedHttp, httpAOpts, false, done);
			});

		it('returns a new copy of the file', function(done) {
				assertCached(cachedHttp, httpAOpts, false, done);
			});

	});

	// Should not cache or crash on 404 or 500
	describe('F-do-not-cachd-404', function() {

		var httpFOpts = _.assign({}, hostOptions, {path: '/F.html', "x-cacheable":true});

		it('should return a 404', function(done) {
			http.request(
				httpFOpts, 
				function(res) {
					assert.equal(res.statusCode, 404);
					done();

				}
			).end();
		});
		it('should not cache this request', function(done) {
				assertCached(cachedHttp, httpFOpts, false, done);
			});

	});

	describe('F-do-not-cache-500', function() {

		var httpFOpts = _.assign({}, hostOptions, {path: '/F', "x-cacheable":true});

		it('should return a 500', function(done) {
			http.request(
				httpFOpts, 
				function(res) {
					assert.equal(res.statusCode, 500);
					done();

				}
			).end();
		});

		it('returns a new copy of the file', function(done) {
				assertCached(cachedHttp, httpFOpts, false, done);
			});

	});

	// test that http.get uses cachedHttp.request
	describe('Use-http.get', function() {

		var httpAOpts = _.assign({}, hostOptions, {path: '/A.html', "x-cacheable": true}),
			fileA;

		it('should cache the file when using cachedHttp.get()', function(done) {
				cachedHttp.get(
					httpAOpts, 
					function(res) {

						var result = { lastModified: res.headers["last-modified"], data: '' };
						originalLastModified = result.lastModified;
						res.on('data', function(chunk) {
							result.data += chunk;
						});
						res.on('end', function() {
							fileA = result;
							done();
						});

					}
				);
			});

		it('returns a cached copy when requesting the same file', function(done) {
				assertCached(cachedHttp, httpAOpts, {statusCode:304}, done);
			});

	});


	describe('A-file-with-slower response times', function() {

		var httpBOpts = _.assign({}, hostOptions, {path: '/B.html', "x-cacheable": true}),
			fileB,
			originalLastModified;

		for(var i = 100; i <= 1600; i += 500) {

			(function(i){
				it('should cache the file ('+i+'ms)', function(done) {
					server.resetB(function() {
							cachedHttp.request(
								_.assign({}, httpBOpts, {path:'/B.html?delay='+i}),
								function(res) {

									var result = { lastModified: res.headers["last-modified"], data: '' };
									originalLastModified = result.lastModified;
									res.on('data', function(chunk) {
										result.data += chunk;
									});
									res.on('end', function() {
										fileB = result;
										assert(!res.headers["x-cached"]);
										done();
									});
								}
							).end();
						});
					});


				it('returns a cached copy when requesting the same file', function(done) {
						assertCached(cachedHttp, httpBOpts, {statusCode:304}, done);
					});

			})(i);
		};

	});

});







