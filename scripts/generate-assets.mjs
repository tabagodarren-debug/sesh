import fs from "node:fs";
// Original two-tone chime, generated locally and bundled for offline playback.
const rate = 44100,
  duration = 0.8,
  count = Math.floor(rate * duration),
  buffer = Buffer.alloc(44 + count * 2);
buffer.write("RIFF");
buffer.writeUInt32LE(36 + count * 2, 4);
buffer.write("WAVEfmt ", 8);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(rate, 24);
buffer.writeUInt32LE(rate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++) {
  const t = i / rate,
    envelope = Math.min(1, t / 0.015) * Math.exp(-t * 6);
  buffer.writeInt16LE(
    Math.round(
      (Math.sin(t * 2 * Math.PI * 660) +
        0.35 * Math.sin(t * 2 * Math.PI * 990)) *
        envelope *
        4000,
    ),
    44 + i * 2,
  );
}
fs.writeFileSync("public/completion.wav", buffer);
