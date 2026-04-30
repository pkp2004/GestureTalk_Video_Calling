import gestureModel from './gesture_model.json';

// We use global window objects because MediaPipe bundler support is poor.
const Hands = window.Hands;
const Camera = window.Camera;
const VERSION = '0.4.1646424915'; // Default version fallback

const normalizeLandmarks = (landmarks) => {
  const points = landmarks.map(lm => ({ x: lm.x, y: lm.y }));
  const wrist = points[0];
  const translated = points.map(p => ({ x: p.x - wrist.x, y: p.y - wrist.y }));

  let maxDist = 0;
  for (const p of translated) {
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    if (dist > maxDist) maxDist = dist;
  }

  if (maxDist > 0) {
    return translated.map(p => [p.x / maxDist, p.y / maxDist]);
  }
  return translated.map(p => [p.x, p.y]);
};

const calculateDistance = (p1, p2) => {
  let sum = 0;
  for (let i = 0; i < p1.length; i++) {
    const dx = p1[i][0] - p2[i][0];
    const dy = p1[i][1] - p2[i][1];
    sum += dx * dx + dy * dy;
  }
  return sum; // Squared Euclidean distance is faster to compute
};

const detectGesture = (multiHandLandmarks) => {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) return "";

  const landmarks = multiHandLandmarks[0];
  const normalized = normalizeLandmarks(landmarks);
  // Create a mirrored version of the hand (flip X coordinate)
  const normalizedMirrored = normalized.map(p => [-p[0], p[1]]);

  // K-NN implementation (K=3)
  const distances = [];
  for (const sample of gestureModel) {
    const distNormal = calculateDistance(normalized, sample.landmarks);
    const distMirrored = calculateDistance(normalizedMirrored, sample.landmarks);
    // Take the minimum distance between the normal and mirrored hand
    distances.push({ label: sample.label, dist: Math.min(distNormal, distMirrored) });
  }

  distances.sort((a, b) => a.dist - b.dist);

  // Debugging: Log the closest distance
  console.log(`Closest: ${distances[0].label} (dist: ${distances[0].dist.toFixed(3)})`);

  // Reject if the best match is too far
  // Threshold increased to 1.5 for sum of squared distances
  if (distances[0].dist > 1.5) return "";

  // Get top 3
  const top3 = distances.slice(0, 3);
  const counts = {};
  let bestLabel = top3[0].label;
  let maxCount = 0;

  for (const item of top3) {
    counts[item.label] = (counts[item.label] || 0) + 1;
    if (counts[item.label] > maxCount) {
      maxCount = counts[item.label];
      bestLabel = item.label;
    }
  }

  return bestLabel;
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
        // Debounce: require 7 consecutive frames of the same gesture
        if (gestureCount === 7) {
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
