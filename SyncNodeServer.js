"use strict"

var fs = require('fs');
var path = require('path');



class Response {
	constructor(requestGuid, data) {
		this.requestGuid = requestGuid;
		this.stamp = new Date();
		this.data = data;
	}
}

// TODO: implement versions on each node to enforce optimistic concurrency.
class SyncNodeServer {
    constructor(io, options) {
        this.io = io;
		this.backupCount = 0;
		this.numBackups = 0;
        this.namespace = options.namespace;
        this.directory = options.dataDirectory || '../private';

		var defaultData = options.defaultData;
        if (defaultData === void 0) { defaultData = {}; }
        this.get((data) => {
            this.data = data;
            if (!this.data) {
                this.data = JSON.parse(JSON.stringify(defaultData)); // Use a copy for immutability
            }
            this.start();
        });
    }
    start() {
        this.ioNamespace = this.io.of(this.namespace);
        this.ioNamespace.on('connection', (socket) => {
            console.log('someone connected to ' + this.namespace);
            socket.on('getLatest', (clientVersion) => {
                console.log('getLatest', this.data.version, clientVersion);
                if (!clientVersion || clientVersion !== this.data.version) {
                    socket.emit('latest', this.data);
                }
                else {
                    console.log('already has latest.');
                    socket.emit('latest', null);
                }
            });
            socket.on('update', (request) => {
                var merge = request.data;
				if(request.concurrencyVersion !== this.data.version) {
					// Probably should stop here and send a concurency error response to client:
					console.error('WARNING: Server version NOT EQUAL TO concurrencyVersion', request.concurrencyVersion, this.data.version);
				}
                this.doMerge(this.data, merge);
                this.persist();
                socket.emit('updateResponse', new Response(request.requestGuid));
                socket.broadcast.emit('update', merge);
                if (this.onMerge)
                    this.onMerge(merge);
            });
        });
    }
	get(callback) {
		var path = this.buildFilePath() + '.json';
		fs.readFile(path, 'utf8', (err, data) => {
			if (err) {
				if (err.code === 'ENOENT') {
					callback(null);
				}
				else {
					console.error('Failed to read ' + path + ': ' + err);
					callback(null);
				}
			}
			else {
				callback(JSON.parse(data));
			}
		});
	}

	persist() {
		var path = this.buildFilePath();
		console.log(path);
		fs.mkdir(this.directory, null, (err) => {
			if (err) {
				// ignore the error if the folder already exists
				if (err.code != 'EEXIST') {
					console.error('Failed to create folder ' + this.directory + ': ' + err);
					return;
				}
			}
			var str = JSON.stringify(this.data);
			fs.writeFile(path + '.json', str, (err) => {
				if (err) {
					console.error('Failed to write ' + path + ': ' + err);
				}
			});
			if(this.numBackups > 0) {
				var backupPath = path + ((this.backupCount++ % this.numBackups) + 1).toString() + '.json';
				fs.writeFile(backupPath, str, (err) => {
					if (err) {
						console.error('Failed to write backup ' + backupPath + ': ' + err);
					}
				});	
			}
		});
	}

	buildFilePath() {
		return path.join(this.directory, this.namespace);
	}
	isObject(val) {
		return typeof val === 'object' && val != null;	
	}
	doMerge(obj, merge) {
		if(!this.isObject(merge)) {
			// not an object, end of recursion
			return merge;
		} else if(!this.isObject(obj)) {
			// merge is an object, so make sure obj is an object:
			obj = {};
		}
		Object.keys(merge).forEach((key) => {			
			if (key === '__remove') {
				var propsToRemove = merge[key];
				if(!Array.isArray(propsToRemove) && typeof propsToRemove === 'string') {
					var arr = [];
				        arr.push(propsToRemove);
			       		propsToRemove = arr; 
				}
				propsToRemove.forEach((prop) => {
					delete obj[prop];
				});
			}
			else {
				var nextObj = (obj[key] || {});
				obj[key] = this.doMerge(nextObj, merge[key]);
			}
		});
		return obj;
	}


	// For generating unique keys:

	static s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.substring(1);
	}

	static guidShort() {
		return SyncNode.s4() + SyncNode.s4();
	}
	static guid() {
		return SyncNode.s4() + SyncNode.s4() + '-' + SyncNode.s4() + '-' + SyncNode.s4() + '-' +
			SyncNode.s4() + '-' + SyncNode.s4() + SyncNode.s4() + SyncNode.s4();
	}
}


module.exports = SyncNodeServer;

