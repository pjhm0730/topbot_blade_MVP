import { useEffect, useRef, useState } from "react";
import { audioManager, type AudioSettings } from "../audio/audioManager";

interface SoundControlsProps {
  compact?: boolean;
}

export function SoundControls({ compact = false }: SoundControlsProps) {
  const [settings, setSettings] = useState<AudioSettings>(() => audioManager.getSettings());
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => audioManager.subscribe(setSettings), []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);

  const togglePopover = () => {
    void audioManager.initAudio();
    setIsOpen((previous) => !previous);
  };

  const toggleMuted = () => {
    void audioManager.initAudio();
    audioManager.setMuted(!settings.muted);
  };

  const changeSfxVolume = (value: string) => {
    void audioManager.initAudio();
    audioManager.setSfxVolume(Number(value) / 100);
  };

  const changeBgmVolume = (value: string) => {
    void audioManager.initAudio();
    audioManager.setBgmVolume(Number(value) / 100);
  };

  const bgmModeLabel = (() => {
    if (settings.muted || settings.bgmMode === "none") {
      return "꺼짐";
    }

    const modeLabel = settings.bgmMode === "battle" ? "전투" : "로비";
    if (!settings.ready) {
      return `${modeLabel} · 첫 터치 대기`;
    }

    return modeLabel;
  })();

  if (compact) {
    return (
      <button className="secondary-button sound-compact-button" type="button" onClick={toggleMuted}>
        {settings.muted ? "🔇" : "🔊"}
      </button>
    );
  }

  return (
    <aside ref={panelRef} className={`sound-panel ${isOpen ? "is-open" : ""}`} aria-label="사운드 설정">
      <button
        className="sound-floating-button"
        type="button"
        aria-expanded={isOpen}
        aria-label="사운드 설정 열기"
        onClick={togglePopover}
      >
        {settings.muted ? "🔇" : "🔊"}
      </button>
      {isOpen && (
        <div className="sound-popover">
          <p className="sound-mode">BGM: {bgmModeLabel}</p>
          <button className="secondary-button sound-toggle-button" type="button" onClick={toggleMuted}>
            {settings.muted ? "사운드 켜기" : "사운드 끄기"}
          </button>
          <label className="sound-slider">
            <span>효과음</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(settings.sfxVolume * 100)}
              onChange={(event) => changeSfxVolume(event.target.value)}
              aria-label="효과음 볼륨"
            />
          </label>
          <label className="sound-slider">
            <span>배경음</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(settings.bgmVolume * 100)}
              onChange={(event) => changeBgmVolume(event.target.value)}
              aria-label="배경음 볼륨"
            />
          </label>
        </div>
      )}
    </aside>
  );
}
