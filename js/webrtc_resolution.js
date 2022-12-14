// Look after different browser vendors' ways of calling the getUserMedia()
// API method:
// Opera --> getUserMedia
// Chrome --> webkitGetUserMedia
// Firefox --> mozGetUserMedia

navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || top.navigator.mediaDevices.getUserMedia;

// Use constraints to ask for a video-only MediaStream:
var constraints = {audio: false, video: { width: 3840, height: 2160 }};
var video = document.querySelector("#localVideo");

video.onloadedmetadata = function() { 
    console.log('camera width is', this.videoWidth); 
    console.log('camera height is', this.videoHeight); 
} 

// Callback to be called in case of success...
function successCallback(stream) {

  // Note: make the returned stream available to console for inspection
  window.stream = stream;

  if (window.URL) {
    // Chrome case: URL.createObjectURL() converts a MediaStream to a blob URL

    // Reference: https://github.com/a-wing/webrtc-book-cn/issues/1
    // video.src = window.URL.createObjectURL(stream);

    video.srcObject = stream;
  } else {
    // Firefox and Opera: the src of the video can be set directly from the stream
    video.src = stream;
  }

  // We're all set. Let's just play the video out!
  video.play();
}

// Callback to be called in case of failures...
function errorCallback(error) {
  console.log("navigator.getUserMedia error: ", error);
}

// Main action: just call getUserMedia() on the navigator object
navigator.getUserMedia(constraints, successCallback, errorCallback);

// 'use strict';

// // Look after different browser vendors' ways of calling the getUserMedia()
// // API method:
// // Opera --> getUserMedia
// // Chrome --> webkitGetUserMedia
// // Firefox --> mozGetUserMedia
// //navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mediaDevices.getUserMedia;
// var m_localVideo = document.querySelector('#localVideo');
// var constraints = {video: true};

// var m_localStream;

// m_localVideo.onloadedmetadata = function() { 
//     console.log('width is', this.videoWidth); 
//     console.log('height is', this.videoHeight); 
// } 

// function handleUserMediaCall(stream) {
//     m_localStream = stream;
//     attachMediaStream(m_localVideo, stream);
//     //window.URL.createObjectURL(stream)
//     console.log('Adding local stream.');
//   }
  
// function handleUserMediaError(error) {
//     console.log('navigator.getUserMedia error: ', error);
//   }

//   // Call getUserMedia()
//   navigator.getUserMedia(constraints, handleUserMediaCall, handleUserMediaError);
//   console.log('Getting user media with constraints', constraints);