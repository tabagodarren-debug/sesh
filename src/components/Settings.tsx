import { useState } from "react";
import { Image, MousePointer2, SlidersHorizontal, Type } from "lucide-react";
import { positions, defaults, type SeshSettings } from "../domain/settings";
import { Dialog } from "./Dialog";

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  unit?: string;
}) {
  return (
    <label className="slider-row">
      <span>
        {label}
        <output>
          {Math.round(value)}
          {unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Settings({
  settings: s,
  update,
  onClose,
  background,
  onLibrary,
  standalone = false,
}: {
  settings: SeshSettings;
  update: (patch: Partial<SeshSettings>) => void;
  onClose: () => void;
  background: string | null;
  onLibrary: () => void;
  standalone?: boolean;
}) {
  const [textTab, setTextTab] = useState(false);
  return (
    <Dialog title="Appearance" onClose={onClose} standalone={standalone}>
      {(close) => (
        <>
          <div className="dialog-body">
            <div className="config-intro">
              <span className="config-intro-icon">
                <SlidersHorizontal aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">MAKE IT YOURS</p>
                <p>
                  Fine-tune the atmosphere without interrupting your session.
                </p>
              </div>
            </div>
            <button
              className="appearance-preview"
              onClick={onLibrary}
              style={
                background
                  ? {
                      backgroundImage: `linear-gradient(#0007,#0007), url("${background}")`,
                    }
                  : {}
              }
            >
              <span>
                <Image aria-hidden="true" /> Background library
              </span>
              <small>
                Choose your atmosphere <b>→</b>
              </small>
            </button>
            <div className="tabs sub">
              <button aria-pressed={!textTab} onClick={() => setTextTab(false)}>
                <Image aria-hidden="true" /> Background
              </button>
              <button aria-pressed={textTab} onClick={() => setTextTab(true)}>
                <Type aria-hidden="true" /> Text
              </button>
            </div>
            <div
              key={textTab ? "text" : "background"}
              className="tab-panel settings-tab-panel"
            >
              {textTab ? (
                <>
                  <Slider
                    label="Text opacity"
                    value={s.textOpacity * 100}
                    min={60}
                    max={100}
                    unit="%"
                    onChange={(v) => update({ textOpacity: v / 100 })}
                  />
                  <Slider
                    label="Text scale"
                    value={s.textScale * 100}
                    min={80}
                    max={120}
                    unit="%"
                    onChange={(v) => update({ textScale: v / 100 })}
                  />
                  <div className="cursor-setting">
                    <span>
                      Cursor style
                      <small>Choose native behavior or the SESH pointer set.</small>
                    </span>
                    <div className="cursor-options" role="group" aria-label="Cursor style">
                      <button
                        type="button"
                        aria-pressed={s.cursorStyle === "system"}
                        onClick={() => update({ cursorStyle: "system" })}
                      >
                        <MousePointer2 aria-hidden="true" />
                        System
                      </button>
                      <button
                        type="button"
                        aria-pressed={s.cursorStyle === "sesh"}
                        onClick={() => update({ cursorStyle: "sesh" })}
                      >
                        <span className="sesh-cursor-preview" aria-hidden="true" />
                        SESH
                      </button>
                    </div>
                  </div>
                  <p className="hint">
                    Geist, always. Cursor changes stay inside SESH.
                  </p>
                </>
              ) : (
                <>
                  <Slider label="Blur" value={s.blur} min={0} max={20} unit=" px" onChange={(v) => update({ blur: v })} />
                  <Slider label="Image opacity" value={s.opacity * 100} min={0} max={100} unit="%" onChange={(v) => update({ opacity: v / 100 })} />
                  <Slider label="Dark overlay" value={s.overlay * 100} min={0} max={100} unit="%" onChange={(v) => update({ overlay: v / 100 })} />
                  <label className="setting-row">
                    Image fit
                    <select value={s.fit} onChange={(e) => update({ fit: e.target.value as "cover" | "contain" })}>
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                    </select>
                  </label>
                  <label className="setting-row">
                    Image position
                    <select value={s.position} onChange={(e) => update({ position: e.target.value as SeshSettings["position"] })}>
                      {positions.map((p) => <option key={p} value={p}>{p.replace("center center", "center")}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>
          <footer className="dialog-foot">
            <button className="text-button" onClick={() => {
              const d = defaults();
              update({ blur: d.blur, opacity: d.opacity, overlay: d.overlay, fit: d.fit, position: d.position, textOpacity: d.textOpacity, textScale: d.textScale, cursorStyle: d.cursorStyle });
            }}>Reset appearance</button>
            <button className="primary" onClick={close}>Done</button>
          </footer>
        </>
      )}
    </Dialog>
  );
}
