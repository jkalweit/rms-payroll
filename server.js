"use strict"

var http = require('http');
var fs = require('fs');
var express = require('express');
var socketio = require('socket.io');
var chokidar = require('chokidar');
var Sync = require('./SyncNodeServer.js');


var app = express();
var server = http.createServer(app);
var io = socketio.listen(server);


var syncServer = new Sync(io, { namespace: 'data', dataDirectory: '../private' });

app.use('/', express.static('client/dist/'));



/* For Debugging, send a signal when file changes */
chokidar.watch('./client/dist', { depth: 99 }).on('change', (filePath) => {
	if(filePath.match(/\.js$/i) !== null 
		|| filePath.match(/\.html$/i) !== null 
		|| filePath.match(/\.css$/i) !== null
		) {
		console.log('file changed!', filePath);
		io.emit('reload');
	};
});




server.listen(process.env.PORT || 13374, process.env.IP || "0.0.0.0", function(){
  var addr = server.address();
  console.log("Sync Server listening at", addr.address + ":" + addr.port);
});

