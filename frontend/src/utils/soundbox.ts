export type SoundboxLanguage = "en" | "kn";

export interface SoundboxSettings {
  enabled: boolean;
  language: SoundboxLanguage;
  volume: number; // 0.0 to 1.0
  chimeEnabled: boolean;
}

const SETTINGS_KEY = "smartstock_soundbox_settings";
const DEFAULT_SETTINGS: SoundboxSettings = {
  enabled: true,
  language: "en",
  volume: 1.0,
  chimeEnabled: true,
};

export function getSoundboxSettings(): SoundboxSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(saved) as Partial<SoundboxSettings>;
    return {
      enabled: parsed.enabled !== false,
      language: parsed.language === "kn" ? "kn" : "en",
      volume: typeof parsed.volume === "number" ? Math.max(0.1, Math.min(1.0, parsed.volume)) : 1.0,
      chimeEnabled: parsed.chimeEnabled !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSoundboxSettings(settings: SoundboxSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event("smartstock:soundbox-settings"));
}

/**
 * Synthesizes a crisp, two-tone UPI soundbox alert chime (e.g., PhonePe / Paytm style)
 * using the Web Audio API without requiring any external MP3 asset.
 */
export function playSoundboxChime(volume: number = 1.0): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        resolve();
        return;
      }
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.05, volume * 0.4), now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      gain.connect(ctx.destination);

      // Note 1: 587.33 Hz (D5)
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.connect(gain);
      osc1.start(now);
      osc1.stop(now + 0.16);

      // Note 2: 880.00 Hz (A5 - High bright chime)
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880.0, now + 0.14);
      osc2.connect(gain);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.45);

      setTimeout(() => {
        try {
          ctx.close();
        } catch (_) {}
        resolve();
      }, 480);
    } catch (_) {
      resolve();
    }
  });
}

/**
 * Announces payment confirmation with chime + text-to-speech.
 */
export async function announcePayment(
  amount: number,
  paymentMethod: "CASH" | "UPI" | "CARD" | "CREDIT" | "SPLIT" = "UPI"
): Promise<void> {
  if (typeof window === "undefined") return;
  const settings = getSoundboxSettings();
  if (!settings.enabled) return;

  // 1. Play signature payment chime
  if (settings.chimeEnabled) {
    await playSoundboxChime(settings.volume);
  }

  // 2. Announce Voice confirmation via SpeechSynthesis
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();

  const kannadaVoice = voices.find(
    (voice) => voice.lang.toLowerCase().startsWith("kn") || voice.name.toLowerCase().includes("kannada")
  );
  const useKannada = settings.language === "kn" && !!kannadaVoice;

  const formattedAmount = Number(amount).toFixed(0);

  let message = "";
  if (useKannada) {
    if (paymentMethod === "UPI") {
      message = `ಸ್ಮಾರ್ಟ್‌ಸ್ಟಾಕ್: ಯುಪಿಐ ಮೂಲಕ ${formattedAmount} ರೂಪಾಯಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ. ಧನ್ಯವಾದಗಳು!`;
    } else if (paymentMethod === "CASH") {
      message = `ಸ್ಮಾರ್ಟ್‌ಸ್ಟಾಕ್: ನಗದು ರೂಪದಲ್ಲಿ ${formattedAmount} ರೂಪಾಯಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ.`;
    } else {
      message = `ಸ್ಮಾರ್ಟ್‌ಸ್ಟಾಕ್: ${formattedAmount} ರೂಪಾಯಿ ಪಾವತಿಯಾಗಿದೆ.`;
    }
  } else {
    if (paymentMethod === "UPI") {
      message = `SmartStock: Received ${formattedAmount} rupees on UPI QR. Thank you!`;
    } else if (paymentMethod === "CASH") {
      message = `SmartStock: Received ${formattedAmount} rupees in cash.`;
    } else {
      message = `SmartStock: Payment of ${formattedAmount} rupees received.`;
    }
  }

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = useKannada ? "kn-IN" : "en-IN";
  utterance.volume = settings.volume;
  utterance.rate = 1.0;
  utterance.pitch = 1.05;

  if (useKannada && kannadaVoice) {
    utterance.voice = kannadaVoice;
  } else {
    const indianEnglishVoice = voices.find(
      (v) =>
        v.lang.toLowerCase() === "en-in" ||
        v.name.toLowerCase().includes("india") ||
        v.name.toLowerCase().includes("english (india)")
    );
    if (indianEnglishVoice) utterance.voice = indianEnglishVoice;
  }

  synth.cancel(); // Stop any pending utterances
  synth.speak(utterance);
}

/**
 * Interactive test function for UI settings.
 */
export function testSoundboxAnnouncement(
  sampleAmount: number = 250,
  method: "UPI" | "CASH" = "UPI"
): void {
  announcePayment(sampleAmount, method);
}
