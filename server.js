const mqtt = require("mqtt");

// ---------------- CONFIG ----------------
const broker = "mqtt://192.168.1.231";
const topics = ["sarayu/d1/topic1"];

// ---------------- PARAMETERS ----------------
const signalFrequency = 10;
const tachoFixedFreq = 10;

const amplitude = 1.0;
const offset = 32768;
const sampleRate = 4096;
const samples = 4096;
const timePerMessage = 0.5;

const num6ch = 6;
const num4ch = 4;
const numTachoChannels = 2;

const HEADER_LEN = 100;
const TOTAL_LEN = 49252;

// ---------------- STATE ----------------
let currentTime = 0.0;
let headerToggle = true;

// ---------------- MQTT ----------------
const client = mqtt.connect(broker);

client.on("connect", () => {
  console.log("MQTT Publisher started (HEADER TOGGLE MODE)");

  setInterval(publishMessage, 500);
});

// ---------------- MAIN LOOP ----------------
function publishMessage() {
  try {
    // -------- HEADER --------
    const frameA = headerToggle ? 1 : 2;
    const frameB = headerToggle ? 1 : 2;
    headerToggle = !headerToggle;

    let header = [
      frameA,
      frameB,
      num6ch + num4ch,
      sampleRate,
      4096,
      samples,
      numTachoChannels,
      0,
      0,
      0,
    ];

    while (header.length < HEADER_LEN) {
      header.push(0);
    }

    // -------- BASE SINE --------
    const amplitudeScaled = (amplitude * 0.5) / (3.3 / 65535);
    let base = new Array(samples);

    for (let i = 0; i < samples; i++) {
      const t = currentTime + i / sampleRate;
      const val =
        offset + amplitudeScaled * Math.sin(2 * Math.PI * signalFrequency * t);
      base[i] = Math.round(val);
    }

    currentTime += timePerMessage;

    // -------- 6-CHANNEL --------
    let data6ch = [];
    for (const s of base) {
      for (let i = 0; i < num6ch; i++) data6ch.push(s);
    }

    // -------- 4-CHANNEL --------
    let data4ch = [];
    for (const s of base) {
      for (let i = 0; i < num4ch; i++) data4ch.push(s);
    }

    // -------- TACHO FREQ --------
    let tachoFreq = new Array(samples).fill(tachoFixedFreq);

    // -------- TACHO TRIGGER --------
    let tachoTrigger = new Array(samples).fill(0);
    const step = Math.floor(samples / tachoFixedFreq);

    for (let i = 0; i < tachoFixedFreq; i++) {
      const idx = i * step;
      if (idx < samples) tachoTrigger[idx] = 1;
    }

    // -------- BUILD MESSAGE --------
    const message = [
      ...header,
      ...data6ch,
      ...data4ch,
      ...tachoFreq,
      ...tachoTrigger,
    ];

    if (message.length !== TOTAL_LEN) {
      console.error(`Payload length error: ${message.length} != ${TOTAL_LEN}`);
      return;
    }

    // -------- PACK TO UINT16 LE --------
    const buffer = Buffer.alloc(TOTAL_LEN * 2);
    for (let i = 0; i < TOTAL_LEN; i++) {
      buffer.writeUInt16LE(message[i], i * 2);
    }

    // -------- PUBLISH --------
    for (const topic of topics) {
      client.publish(topic, buffer, { qos: 1 });
    }

    console.log(
      `Published OK | Header=(${frameA},${frameB}) | Signal=${signalFrequency}Hz | Tacho=${tachoFixedFreq}Hz`,
    );
  } catch (err) {
    console.error("Publish error:", err);
  }
}
