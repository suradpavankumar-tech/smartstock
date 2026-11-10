import React, { useState, useEffect } from "react";
import {
  Volume2, VolumeX, Sparkles, Check, ChevronDown, Radio, Play
} from "lucide-react";
import {
  getSoundboxSettings,
  saveSoundboxSettings,
  testSoundboxAnnouncement,
  SoundboxSettings
} from "../../utils/soundbox";
import { useLanguage } from "../../context/LanguageContext";

export const SoundboxWidget: React.FC = () => {
  const { language } = useLanguage();
  const isKn = language === "kn";

  const [settings, setSettings] = useState<SoundboxSettings>(getSoundboxSettings());
  const [isOpen, setIsOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setSettings(getSoundboxSettings());
    };
    window.addEventListener("smartstock:soundbox-settings", handleUpdate);
    return () => window.removeEventListener("smartstock:soundbox-settings", handleUpdate);
  }, []);

  const updateSetting = <K extends keyof SoundboxSettings>(key: K, val: SoundboxSettings[K]) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    saveSoundboxSettings(updated);
  };

  const handleTest = () => {
    setTesting(true);
    testSoundboxAnnouncement(250, "UPI");
    setTimeout(() => setTesting(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-[0.98] ${
          settings.enabled
            ? "bg-[#5EEAD4]/15 text-[#6EE7B7] border-[#5EEAD4]/40 shadow-[0_0_12px_rgba(94,234,212,0.2)] hover:bg-[#5EEAD4]/25"
            : "liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC]"
        }`}
        title={isKn ? "ಧ್ವನಿಪೆಟ್ಟಿಗೆ ಸೆಟ್ಟಿಂಗ್ಸ್" : "UPI Soundbox Settings"}
      >
        {settings.enabled ? (
          <Volume2 className="w-3.5 h-3.5 text-[#6EE7B7] animate-pulse" />
        ) : (
          <VolumeX className="w-3.5 h-3.5 text-[#A1AEBB]" />
        )}
        <span className="hidden sm:inline">
          {isKn ? "ಧ್ವನಿಪೆಟ್ಟಿಗೆ" : "Soundbox"}
        </span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 z-40 liquid-modal p-4 text-xs space-y-3.5">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5 font-bold text-[#F8FAFC]">
                <Sparkles className="w-4 h-4 text-[#5EEAD4]" />
                <span>{isKn ? "ಯುಪಿಐ ಧ್ವನಿಪೆಟ್ಟಿಗೆ" : "SmartStock UPI Soundbox"}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => updateSetting("enabled", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#5EEAD4]" />
              </label>
            </div>

            {/* Language Selection */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-[#A1AEBB] uppercase tracking-wider">
                {isKn ? "ಧ್ವನಿ ಭಾಷೆ (Voice Language)" : "Voice Language"}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => updateSetting("language", "en")}
                  className={`py-1.5 px-2 rounded-xl border text-center font-medium transition-all active:scale-[0.98] ${
                    settings.language === "en"
                      ? "bg-[#5EEAD4]/20 border-[#5EEAD4]/50 text-[#6EE7B7] font-bold shadow-[0_0_10px_rgba(94,234,212,0.2)]"
                      : "border-white/10 text-[#A1AEBB] hover:bg-white/[0.06] hover:text-[#F8FAFC]"
                  }`}
                >
                  English (India)
                </button>
                <button
                  onClick={() => updateSetting("language", "kn")}
                  className={`py-1.5 px-2 rounded-xl border text-center font-medium transition-all active:scale-[0.98] ${
                    settings.language === "kn"
                      ? "bg-[#5EEAD4]/20 border-[#5EEAD4]/50 text-[#6EE7B7] font-bold shadow-[0_0_10px_rgba(94,234,212,0.2)]"
                      : "border-white/10 text-[#A1AEBB] hover:bg-white/[0.06] hover:text-[#F8FAFC]"
                  }`}
                >
                  ಕನ್ನಡ (Kannada)
                </button>
              </div>
            </div>

            {/* Chime Toggle */}
            <div className="flex items-center justify-between text-[#F8FAFC] pt-1">
              <span>{isKn ? "ಪಾವತಿ ಘಂಟೆ (Chime)" : "Payment Chime Tone"}</span>
              <input
                type="checkbox"
                checked={settings.chimeEnabled}
                onChange={(e) => updateSetting("chimeEnabled", e.target.checked)}
                className="rounded text-[#5EEAD4] focus:ring-[#5EEAD4] w-3.5 h-3.5 bg-[#080B10] border-white/20"
              />
            </div>

            {/* Volume Slider */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[#A1AEBB] text-[11px]">
                <span>{isKn ? "ಧ್ವನಿ ಪ್ರಮಾಣ (Volume)" : "Volume"}</span>
                <span className="font-mono text-[#F8FAFC]">{Math.round(settings.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.1"
                value={settings.volume}
                onChange={(e) => updateSetting("volume", parseFloat(e.target.value))}
                className="w-full accent-[#5EEAD4] h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
            </div>

            {/* Test Button */}
            <button
              onClick={handleTest}
              disabled={testing || !settings.enabled}
              className="w-full py-2 liquid-btn-primary rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer text-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {testing
                  ? (isKn ? "ಧ್ವನಿ ಬರುತ್ತಿದೆ..." : "Playing...")
                  : (isKn ? "ಧ್ವನಿಪೆಟ್ಟಿಗೆ ಪರೀಕ್ಷಿಸಿ (₹250)" : "Test Soundbox (₹250)")}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
