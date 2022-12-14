var static = require('node-static');
var http = require('http');

// Create a node-static server instance
var file = new(static.Server)();

// We use the http module’s createServer function and
// rely on our instance of node-static to serve the files
var app = http.createServer(function (req, res) {
  file.serve(req, res);
});

// Use socket.io JavaScript library for real-time web applications
//var io = require('socket.io').listen(app);
var io = require('socket.io')(app);
app.listen(8181);
console.log("listen start 8181");

// Let's start managing connections...
io.sockets.on('connection', function (socket) {
  // Handle 'message' messages
  socket.on('broadcastmessage', function (message) {
    log('S --> got message: ', message);
    console.log('S --> got message: ', message);

    // channel-only broadcast...
    socket.broadcast.to('yang').emit('broadcastmessage', message);
  });

  // Handle 'create or join' messages
  socket.on('create or join', function (room) {
    //var numClients = io.sockets.clients(room).length;
    var clients = io.sockets.adapter.rooms.get(room);
    //var numClients = clients.length;

    log('S --> Room ' + room + ' has ' + clients + ' client(s)');
    log('S --> Request to create or join room', room);

    // First client joining...
    if (!clients || clients.length == 0) {
      socket.join(room);
      socket.emit('created', room);
      console.log("created:" + room);
    } else if (clients.size == 1) {
      // Second client joining...
      io.sockets.in(room).emit('join', room);
      socket.join(room);
      socket.emit('joined', room);
      console.log("joined:" + room);
    } else {
      // max two clients
      socket.emit('full', room);
    }

  });

  function log() {
    var array = [">>> "];
    for (var i = 0; i < arguments.length; i++) {
      array.push(arguments[i]);
    }
    socket.emit('log', array);
  }
});