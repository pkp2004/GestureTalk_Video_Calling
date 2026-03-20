// We use global window objects because MediaPipe bundler support is poor.
const Hands = window.Hands;
const Camera = window.Camera;
const VERSION = '0.4.1646424915'; // Default version fallback

const detectGesture = (multiHandLandmarks) => {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) return "";

  // ASL is primarily one-handed for alphabets and numbers
  const landmarks = multiHandLandmarks[0];

  const isFingerUp = (tip, mcp) => landmarks[tip].y < landmarks[mcp].y;

  const indexUp = isFingerUp(8, 5);
  const middleUp = isFingerUp(12, 9);
  const ringUp = isFingerUp(16, 13);
  const pinkyUp = isFingerUp(20, 17);
  const thumbUp = landmarks[4].y < landmarks[3].y;

  // ASL Heuristics + Custom Phrases
  if (indexUp && middleUp && ringUp && pinkyUp && thumbUp) {
    return "Hello";
  } else if (!indexUp && !middleUp && !ringUp && !pinkyUp && thumbUp) {
    return "All the best!"; // Thumbs up
  } else if (!indexUp && !middleUp && !ringUp && pinkyUp && thumbUp) {
    return "I am Fine"; // Thumb and pinky
  } else if (indexUp && !middleUp && !ringUp && pinkyUp && !thumbUp) {
    return "Sure!"; // Index and pinky
  } else if (indexUp && middleUp && ringUp && pinkyUp && !thumbUp) {
    return "Thankyou"; // 4 fingers up
  } else if (indexUp && middleUp && ringUp && !pinkyUp && !thumbUp) {
    return "How are you?"; // 3 fingers up
  } else if (indexUp && middleUp && !ringUp && pinkyUp && !thumbUp) {
    return "7";
  } else if (indexUp && !middleUp && ringUp && pinkyUp && !thumbUp) {
    return "8";
  } else if (!indexUp && middleUp && ringUp && pinkyUp && !thumbUp) {
    return "F";
  } else if (indexUp && middleUp && !ringUp && !pinkyUp && thumbUp) {
    return "3";
  } else if (indexUp && middleUp && !ringUp && !pinkyUp && !thumbUp) {
    return "V";
  } else if (indexUp && !middleUp && !ringUp && !pinkyUp && thumbUp) {
    return "L";
  } else if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
    return "1";
  } else if (!indexUp && !middleUp && !ringUp && pinkyUp && !thumbUp) {
    return "I";
  } else if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
    return "E";
  }

  return "";
};

export const initializeHandTracking = (videoElement, onGestureDetected) => {
  if (!Hands || !Camera) {
    console.error("MediaPipe scripts not loaded yet!");
    return () => { };
  }

  const hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });

  let lastGesture = "";
  let gestureCount = 0;

  hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const gesture = detectGesture(results.multiHandLandmarks);

      if (gesture && gesture === lastGesture) {
        gestureCount++;
        // Debounce: require 15 consecutive frames of the same gesture
        if (gestureCount === 15) {
          onGestureDetected(gesture);
        }
      } else {
        lastGesture = gesture;
        gestureCount = 0;
      }
    }
  });

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      if (videoElement.readyState >= 2) {
        await hands.send({ image: videoElement }).catch(e => console.error("MediaPipe error:", e));
      }
    },
    width: 640,
    height: 480
  });

  camera.start();

  return () => {
    camera.stop();
    hands.close();
  };
};
