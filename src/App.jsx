import { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import { initializeHandTracking } from './gestureDetection';
import './App.css';

// Mapping spoken words to basic emoji gestures for prototype since we lack complete video datasets
const wordToEmoji = {
  "hello": "👋", "hi": "👋", "hey": "👋",
  "good": "👍", "yes": "👍", "fine": "👍",
  "bad": "👎", "no": "👎",
  "peace": "✌️", "two": "✌️",
  "love": "🤟", "rock": "🤘",
  "stop": "✋", "wait": "✋",
  "ok": "👌", "okay": "👌", "perfect": "👌",
  "pray": "🙏", "thanks": "🙏", "thank": "🙏", "please": "🙏",
  "i": "👉", "you": "👈", "me": "👉",
  "look": "👀",
  "one": "☝️"
};

function App() {
  const [inCall, setInCall] = useState(false);
  const [peerId, setPeerId] = useState('');
  const [remotePeerIdValue, setRemotePeerIdValue] = useState('');
  const [recognizedGestureText, setRecognizedGestureText] = useState("");

  // Speech to Sign state
  const [transcribedText, setTranscribedText] = useState("");
  const [currentAvatarEmoji, setCurrentAvatarEmoji] = useState("👋");

  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerInstance = useRef(null);
  const localStream = useRef(null);
  const handTrackingCleanup = useRef(null);
  const recognitionRef = useRef(null);

  const inCallRef = useRef(inCall);
  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);

  useEffect(() => {
    // 1. Initialize PeerJS with reliable STUN servers
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });
    peer.on('open', (id) => setPeerId(id));

    peer.on('call', (call) => {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          localStream.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            startHandTracking(localVideoRef.current);
          }
          call.answer(stream);
          setInCall(true);
          startSpeechRecognition();

          call.on('stream', (userVideoStream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = userVideoStream;
            }
          });
        })
        .catch(err => {
          console.error("Failed to get local stream", err);
          alert("Could not access camera/microphone. Please check permissions.");
        });
    });

    peerInstance.current = peer;

    // 2. Setup Speech Recognition (Web Speech API)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
          else interimTranscript += event.results[i][0].transcript;
        }

        const currentText = finalTranscript || interimTranscript;
        setTranscribedText(currentText);

        // Change avatar emoji based on last seen keyword
        const words = currentText.toLowerCase().trim().split(/\s+/);
        for (let i = words.length - 1; i >= 0; i--) {
          const cleanWord = words[i].replace(/[^a-z]/g, "");
          if (wordToEmoji[cleanWord]) {
            setCurrentAvatarEmoji(wordToEmoji[cleanWord]);
            break;
          }
        }
      };

      // Auto-restart if it stops to keep continuous listening during call
      recognitionRef.current.onend = () => {
        if (inCallRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) { }
        }
      };
    }

    return () => {
      // Destroy local scoped peer so strict-mode doesn't trash active ones
      peer.destroy();
      stopLocalStream();
      stopSpeechRecognition();
      if (handTrackingCleanup.current) handTrackingCleanup.current();
    };
  }, []);

  const startSpeechRecognition = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.start(); } catch (e) { }
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { }
    }
  };

  const speakGesture = (text) => {
    if ('speechSynthesis' in window) {
      // Cancel ongoing speech to avoid echoing backlogged translations
      window.speechSynthesis.cancel();
      // Extract the primary interpretation before any slash to sound natural
      const readableText = text.split('/')[0].trim();
      const utterance = new SpeechSynthesisUtterance(readableText);
      utterance.rate = 1.1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startHandTracking = (videoElement) => {
    if (handTrackingCleanup.current) handTrackingCleanup.current();
    handTrackingCleanup.current = initializeHandTracking(videoElement, (gesture) => {
      setRecognizedGestureText(gesture);
      speakGesture(gesture);
      setTimeout(() => setRecognizedGestureText(""), 4000); // Clear after 4s
    });
  };

  const stopLocalStream = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
    }
    if (handTrackingCleanup.current) {
      handTrackingCleanup.current();
      handTrackingCleanup.current = null;
    }
  };

  const startCall = (remotePeerId) => {
    if (!remotePeerId) return alert("Enter a Remote Peer ID");

    // In case the user enters their own ID
    if (remotePeerId === peerId) return alert("You cannot call yourself!");

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStream.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          startHandTracking(localVideoRef.current);
        }

        const call = peerInstance.current.call(remotePeerId, stream);
        setInCall(true);
        startSpeechRecognition();

        call.on('stream', (userVideoStream) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = userVideoStream;
          }
        });

        call.on('close', () => endCall());
      })
      .catch(err => {
        console.error("Failed to get local stream", err);
        alert("Could not access camera/microphone. Make sure permissions are granted.");
      });
  };

  const endCall = () => {
    setInCall(false);
    stopLocalStream();
    stopSpeechRecognition();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setRecognizedGestureText("");
    setTranscribedText("");
  };

  const toggleMic = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
      }
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <h1>GestureTalk</h1>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
          {inCall ? 'Live Call' : 'Ready'}
        </div>
      </header>

      {/* Main Video Area */}
      <main className="video-area">
        {/* Remote user video container */}
        <div className="remote-video-container" style={{ backgroundColor: '#050505' }}>

          {/* Always rendered, visibly controlled to prevent null ref issues on fast state changes */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full"
            style={{ objectFit: 'cover', display: inCall ? 'block' : 'none' }}
          />

          {!inCall && (
            <div className="flex items-center justify-center h-full flex-col gap-4 p-4" style={{ color: 'var(--text-secondary)', position: 'absolute', inset: 0 }}>
              <div style={{ fontSize: '3rem', opacity: 0.2 }}>📞</div>
              <div style={{ textAlign: 'center', width: '100%', maxWidth: '300px' }}>
                <p style={{ marginBottom: '10px' }}>Your ID: <strong style={{ color: 'var(--primary)', userSelect: 'all', cursor: 'pointer', padding: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>{peerId || 'Loading...'}</strong></p>
                <input
                  type="text"
                  placeholder="Enter remote peer ID to call"
                  value={remotePeerIdValue}
                  onChange={e => setRemotePeerIdValue(e.target.value)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-panel)',
                    color: '#fff',
                    width: '100%',
                    marginBottom: '15px',
                    fontSize: '1rem'
                  }}
                />
                <button
                  className="btn primary"
                  style={{ width: '100%', borderRadius: '8px', height: '50px', fontSize: '1.1rem' }}
                  onClick={() => startCall(remotePeerIdValue)}
                >
                  Call Peer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Local user video */}
        <div className="local-video-container" style={{ display: inCall ? 'block' : 'none' }}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full"
            style={{ objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
        </div>

        {/* Avatar Area (Plays gestures based on remote audio) */}
        {inCall && (
          <div className="avatar-container" title="Sign Language Avatar">
            <span style={{ fontSize: '4rem', transition: 'all 0.3s' }}>{currentAvatarEmoji}</span>
            {transcribedText && (
              <div style={{ position: 'absolute', bottom: '-25px', right: 0, background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', color: '#fff', whiteSpace: 'nowrap' }}>
                {transcribedText.split(' ').slice(-3).join(' ')}...
              </div>
            )}
          </div>
        )}

        {/* Gesture to Text Subtitles */}
        {inCall && recognizedGestureText && (
          <div className="gesture-subtitle">
            <span className="subtitle-label">Sign Translation</span>
            <span>{recognizedGestureText}</span>
          </div>
        )}
      </main>

      {/* Call Controls */}
      <footer className="controls">
        <button className="btn" title="Toggle Mic" onClick={toggleMic} style={{ opacity: isMicOn ? 1 : 0.5 }}>
          {isMicOn ? '🎤' : '🔇'}
        </button>
        <button
          className={`btn ${inCall ? 'danger' : 'primary'}`}
          onClick={() => inCall ? endCall() : startCall(remotePeerIdValue)}
          title={inCall ? "End Call" : "Start Call"}
        >
          {inCall ? '🛑' : '📞'}
        </button>
        <button className="btn" title="Toggle Video" onClick={toggleVideo} style={{ opacity: isVideoOn ? 1 : 0.5 }}>
          {isVideoOn ? '📹' : '🚫'}
        </button>
      </footer>
    </div>
  );
}

export default App;
