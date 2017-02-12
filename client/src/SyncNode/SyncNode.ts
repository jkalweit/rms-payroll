import * as io from "socket.io-client";


export class SyncNodeEventEmitter {
		__eventHandlers: any;
		__anyEventHandlers: any;
		constructor() {
				SyncNode.addNE(this, '__eventHandlers', {});
				SyncNode.addNE(this, '__anyEventHandlers', {});
		}
		on(eventName: string, handler: (...args: any[]) => void) {
				var id = SyncNode.guidShort();
				if(!this.__eventHandlers[eventName]) this.__eventHandlers[eventName] = {};
				this.__eventHandlers[eventName][id] = handler;
				return id;
				/*
				   if(!this.__eventHandlers[eventName]) this.__eventHandlers[eventName] = {};
				   this.__eventHandlers[eventName][handler] = handler;
				 */
		}
		onAny(handler: (...args: any[]) => void) {
				var id = SyncNode.guidShort();
				// Add the eventName to args before invoking anyEventHandlers
				this.__anyEventHandlers[id] = handler;
				return id;
		}
		removeListener(eventName: string, id: string) {
				if(!this.__eventHandlers[eventName]) return;
				delete this.__eventHandlers[eventName][id];
		}
		clearListeners() {
				this.__eventHandlers = {};
		}
		emit(eventName: string, ...restOfArgs: any[]) {
				var handlers = this.__eventHandlers[eventName] || {};
				var args = new Array(arguments.length-1);
				for(var i = 1; i < arguments.length; ++i) {
						args[i-1] = arguments[i];
				}
				Object.keys(handlers).forEach((key) => { handlers[key].apply(null, args); });
				// Add the eventName to args before invoking anyEventHandlers
				args.unshift(eventName);
				Object.keys(this.__anyEventHandlers).forEach((key) => { 
						this.__anyEventHandlers[key].apply(null, args); 
				});
		}
}

export interface SyncData {
	key: string;
	version: string;
	parent: SyncData;
	[key: string]: any;
	set(key: string, val: any): void;
	setItem(val: any): void;
	remove(key: string): void;
}

export class SyncNode extends SyncNodeEventEmitter implements SyncData {
		__isUpdatesDisabled: boolean = false;
		key: string;
		version: string;
		parent: SyncData;

		constructor(obj?: any, parent?: SyncNode) {
				super();

				obj = obj || {};
				SyncNode.addNE(this, '__isUpdatesDisabled', false);
				SyncNode.addNE(this, 'parent', parent);

				Object.keys(obj).forEach((propName) => {
						var propValue = obj[propName];
						if (SyncNode.isObject(propValue)) {
								if (!SyncNode.isSyncNode(propValue)) {
										propValue = new SyncNode(propValue);
								}

								SyncNode.addNE(propValue, 'parent', this);
								propValue.on('updated', this.createOnUpdated(propName));
						}
						(this as any)[propName] = propValue;
				});
		}
		createOnUpdated(propName: string) {
				return (updated: SyncNode, merge: any) => {				
						if(!this.__isUpdatesDisabled) {
								var newUpdated = this;
								var newMerge = {} as any;
								newMerge[propName] = merge;
								if(updated.version) { 
										this.version = updated.version;
								} else {
										this.version = SyncNode.guidShort();
								}
								newMerge.version = this.version;
								this.emit('updated', newUpdated, newMerge);
						}
				}
		}
		static equals(obj1: any, obj2: any) {
				// use === to differentiate between undefined and null
				if(obj1 === null && obj2 === null) {
						return true;
				} else if((obj1 != null && obj2 == null) || (obj1 == null && obj2 != null)) {
						return false;	
				} else if(obj1 && obj2 && obj1.version && obj2.version) {
						return obj1.version === obj2.version;
				} else if(typeof obj1 !== 'object' && typeof obj2 !== 'object') {
						return obj1 === obj2;
				}

				return false;	
		}
		set(key: string, val: any) {
				let merge: any = {};
				let split: string[] = key.split('.');
				let curr: any = merge;
				for(var i = 0; i < split.length - 1; i++) {
						curr[split[i]] = {};
						curr = curr[split[i]];		
				}
				curr[split[split.length-1]] = val;
				var result = this.merge(merge);
				return this;
		}
		get(path: string) {
				if(!path) return this;
				return SyncNode.getHelper(this, path.split('.'));
		}
		static getHelper(obj: any, split: string[]): any {
				let isObject = SyncNode.isObject(obj);
				if(split.length === 1) { 
						return isObject ? obj[split[0]] : null;
				}
				if(!isObject) return null;
				return SyncNode.getHelper(obj[split[0]], split.slice(1, split.length));
		}
		remove(key: string) {
				if(this.hasOwnProperty(key)) {
						this.merge({ '__remove': key });
				}
				return this;
		}
		static isObject(val: any) {
				return typeof val === 'object' && val != null;
		}
		static isSyncNode(val: any) {
				if(!SyncNode.isObject(val)) return false;
				var className = val.constructor.toString().match(/\w+/g)[1];
				return className === 'SyncNode';
		}
		merge(merge: any) {
				var result = this.doMerge(merge);
				if(result.hasChanges) {
						this.emit('updated', this, result.merge);
				}
				return this;
		}
		doMerge(merge: any, disableUpdates: boolean = false) {
				var hasChanges = false;
				var isEmpty = false;
				var newMerge = {} as any;
				Object.keys(merge).forEach((key) => {
						if(key === '__remove') {
								var propsToRemove = merge[key];
								if(!Array.isArray(propsToRemove) && typeof propsToRemove === 'string') {
										var arr = [];
										arr.push(propsToRemove);
										propsToRemove = arr;	       
								}
								propsToRemove.forEach((prop: string) => {
										delete (this as any)[prop];
								});
								if(!disableUpdates) {
										this.version = SyncNode.guidShort();
										newMerge['__remove'] = propsToRemove;
										hasChanges = true;
								}
						} else {
								var currVal = (this as any)[key];
								var newVal = merge[key];
								if(!SyncNode.equals(currVal, newVal)) {
										if(!SyncNode.isObject(newVal)) {
												// at a leaf node of the merge
												// we already know they aren't equal, simply set the value
												(this as any)[key] = newVal;
												if(!disableUpdates) {
														this.version = SyncNode.guidShort();
														newMerge[key] = newVal;
														hasChanges = true;
												}
										} else {
												// about to merge an object, make sure currVal is a SyncNode	
												if(!SyncNode.isSyncNode(currVal)) {
														currVal = new SyncNode({}, this);	
												}
												currVal.clearListeners();	
												currVal.on('updated', this.createOnUpdated(key));

												var result = currVal.doMerge(newVal, disableUpdates);
												if(typeof (this as any)[key] === 'undefined') {
														result.hasChanges = true;
												}
												(this as any)[key] = currVal;
												if(!disableUpdates && result.hasChanges) {
														if(typeof currVal.version === 'undefined') {
																currVal.version = SyncNode.guidShort();
														}
														this.version = currVal.version;
														newMerge[key] = result.merge;
														hasChanges = true;
												}
										}
								}
						}
				});
				if(!disableUpdates && hasChanges) {
						newMerge.version = this.version;
						return { hasChanges: true, merge: newMerge };
				} else {
						return { hasChanges: false, merge: newMerge };
				}
		}
		static addNE(obj: any, propName: string, value: any) {
				Object.defineProperty(obj, propName, {
						enumerable: false,
						configurable: true,
						writable: true,
						value: value
				});
		};

		static s4() {
				return Math.floor((1 + Math.random()) * 0x10000)
				.toString(16)
				.substring(1);
		}

		static guidShort() {
				// Often used as an Object key, so prepend with letter to ensure parsed as a string and preserve 
				// insertion order when calling Object.keys -JDK 12/1/2016
				// http://stackoverflow.com/questions/5525795/does-javascript-guarantee-object-property-order
				return 'a' + SyncNode.s4() + SyncNode.s4();
		}
		static guid() {
				return SyncNode.s4() + SyncNode.s4() + '-' + SyncNode.s4() + '-' + SyncNode.s4() + '-' +
						SyncNode.s4() + '-' + SyncNode.s4() + SyncNode.s4() + SyncNode.s4();
		}
		// Like set(), but assumes or adds a key property 
		setItem(item: any) {
				if(!SyncNode.isObject(item)){
						console.error('SyncNode: item must be an object');
						return;
				} else {
						if(!('key' in item)) item.key = SyncNode.guidShort();
						this.set(item.key, item);
						return (this as any)[item.key];
				}
		}
		// Opinionated convenience function to create a SyncNode with a (probably) locally-unique key and a timestamp
		static item() {
				return new SyncNode({ 
						key: SyncNode.guidShort(),
						createdAt: new Date().toISOString()
				});
		}
}


export class SyncNodeLocal extends SyncNode  {
		constructor(id: string) {
				let data: any = JSON.parse(localStorage.getItem(id) as string);
				super(data);
				this.on('updated', () => {
						localStorage.setItem(id, JSON.stringify(this));
				});
		}
}

interface SyncNodeSocketRequest {
	requestGuid: string;	
}

interface SyncNodeSocketResponse {
	requestGuid: string;	
}

export class SyncNodeSocket extends SyncNodeEventEmitter {
		updatesDisabled: boolean;
		status: string;
		path: string;
		openRequests: {[s: string]: SyncNodeSocketRequest};
		defaultObject: any;
		server: SocketIOClient.Socket;
		data: SyncNode;
		concurrencyVersion: string;
		debugCount: number;

		constructor(path: string, defaultObject: any, host?: string) {
				super();

				this.updatesDisabled = false; //To prevent loop when setting data received from server
				this.status = 'Initializing...';
				if (!(path[0] === '/'))
						path = '/' + path; //normalize
				this.path = path;
				this.openRequests = {};
				this.defaultObject = defaultObject || {};
				this.setLocal(new SyncNode(JSON.parse(localStorage.getItem(this.path) as string))); //get local cache
				host = host || ('//' + location.host);
				var socketHost = host + path;
				console.log('Connecting to namespace: "' + socketHost + '"');
				this.server = io(socketHost);
				this.server.on('connect', () => {
						console.log('*************CONNECTED');
						this.status = 'Connected';
						this.updateStatus(this.status);
						this.getLatest();
				});
				this.server.on('disconnect', () => {
						console.log('*************DISCONNECTED');
						this.status = 'Disconnected';
						this.updateStatus(this.status);
				});
				this.server.on('reconnect', (number: number) => {
						console.log('*************Reconnected after ' + number + ' tries');
						this.status = 'Connected';
						this.updateStatus(this.status);
				});
				this.server.on('reconnect_failed', (number: number) => {
						console.log('*************************Reconnection failed.');
				});
				this.server.on('update', (merge: SyncNode) => {
						//console.log('*************handle update: ', merge);
						this.updatesDisabled = true;
						var result = this.data.doMerge(merge, true);
						this.concurrencyVersion = merge.version;
						this.emit('updated', this.data, merge);
						this.updatesDisabled = false;
						//console.log('*************AFTER handle update: ', this.data);
				});
				this.server.on('updateResponse', (response: SyncNodeSocketResponse) => {
						//console.log('*************handle response: ', response);
						this.clearRequest(response.requestGuid);
				});
				this.server.on('latest', (latest: SyncNode) => {
						if (!latest) {
								console.log('already has latest.'); //, this.data);
								this.emit('updated', this.data);
						}
						else {
								console.log('handle latest');
								localStorage.setItem(this.path, JSON.stringify(latest));
								this.setLocal(new SyncNode(latest));
						}
						this.sendOpenRequests();
				});
		}
		setLocal(syncNode: SyncNode) {		
				//console.log('setting Local', syncNode.version);
				if(!this.debugCount) this.debugCount = 1;
				this.data = syncNode;
				this.data.on('updated', (updated: SyncNode, merge: SyncNode) => {
						localStorage.setItem(this.path, JSON.stringify(this.data));
						this.queueUpdate(merge);
						this.concurrencyVersion = merge.version;
						this.emit('updated', this.data, merge);
				});
				this.concurrencyVersion = this.data.version;
				this.emit('updated', this.data);
		}
		sendOpenRequests() {
				var keys = Object.keys(this.openRequests);
				keys.forEach((key) => {
						this.sendRequest(this.openRequests[key]);
				});
		}
		clearRequest(requestGuid: string) {
				delete this.openRequests[requestGuid];
		}
		getLatest() {
				this.sendOpenRequests();
				this.server.emit('getLatest', this.data.version); //, this.serverLastModified);
				console.log('sent get latest...', this.data.version);
		}
		updateStatus(status: string) {
				this.status = status;
				this.emit('statusChanged', this.path, this.status);
		}
		queueUpdate(update: SyncNode) {
				if (!this.updatesDisabled) {
						// prepend an 'a' to make sure the guid isn't parsed as a number, so that Object.keys preserves order... 2016-12-09 -JDK 
						var request = {
								requestGuid: 'a' + SyncNode.guid(),
								stamp: new Date(),
								data: update,
								concurrencyVersion: this.concurrencyVersion
						};
						this.sendRequest(request);
				}
		}
		sendRequest(request: SyncNodeSocketRequest) {
				this.openRequests[request.requestGuid] = request;
				if (this.server['connected']) {
						//console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!emitting update', request.concurrencyVersion, request.data.version);
						this.server.emit('update', request);
				}
		}
}

