'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

const IDLE_DELAY = 90_000;
type CatAction = 'run' | 'groom' | 'play' | 'roll' | 'cute';

export function IdleCat() {
  const [visible, setVisible] = useState(false);
  const [action, setAction] = useState<CatAction>('run');
  const [position, setPosition] = useState({ x: 18, y: 38, flip: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceTimer = useRef<number | null>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(true), IDLE_DELAY);
    };
    const activity = () => {
      if (visibleRef.current) setVisible(false);
      arm();
    };
    const preview = () => setVisible(true);
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'mousemove', 'keydown', 'touchstart', 'wheel'];
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
    window.addEventListener('kicks-preview-idle-cat' as keyof WindowEventMap, preview);
    arm();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((event) => window.removeEventListener(event, activity));
      window.removeEventListener('kicks-preview-idle-cat' as keyof WindowEventMap, preview);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
    let step = 0;
    const actions: CatAction[] = ['run', 'groom', 'play', 'roll', 'cute'];
    const showNext = () => {
      step = (step + 1) % actions.length;
      const next = actions[step];
      setAction(next);
      if (next === 'run') {
        setPosition((current) => {
          const targetX = 10 + Math.random() * 78;
          const targetY = 22 + Math.random() * 38;
          return { x: targetX, y: targetY, flip: targetX < current.x };
        });
      } else {
        setPosition({ x: 50, y: 39, flip: false });
      }
      sequenceTimer.current = window.setTimeout(showNext, 8_000);
    };
    const kickoff = window.setTimeout(() => {
      setAction('run');
      setPosition({ x: 12, y: 38, flip: false });
      sequenceTimer.current = window.setTimeout(showNext, 8_000);
    }, 0);
    return () => {
      window.clearTimeout(kickoff);
      if (sequenceTimer.current) window.clearTimeout(sequenceTimer.current);
      sequenceTimer.current = null;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || action !== 'run') return;
    const moveAcrossScreen = () => {
      setPosition((current) => {
        const targetX = current.x > 50
          ? 10 + Math.random() * 25
          : 65 + Math.random() * 23;
        const targetY = 24 + Math.random() * 32;
        return { x: targetX, y: targetY, flip: targetX < current.x };
      });
    };
    const firstMove = window.setTimeout(moveAcrossScreen, 80);
    const secondMove = window.setTimeout(moveAcrossScreen, 3_800);
    return () => {
      window.clearTimeout(firstMove);
      window.clearTimeout(secondMove);
    };
  }, [visible, action]);

  if (!visible) return null;

  return (
    <div className="kc-idle-cat" role="dialog" aria-modal="true" aria-label="KICKS CENTER 待機畫面">
      <div className="kc-idle-grid" />
      <div className="kc-idle-orb kc-idle-orb-one" />
      <div className="kc-idle-orb kc-idle-orb-two" />
      <div className="kc-idle-brand">
        <span className="kc-idle-brand-mark">KC</span>
        <span><b>KICKS CENTER</b><small>POS IS TAKING A BREAK</small></span>
      </div>

      <div
        className={`kc-cat-stage kc-cat-action-${action} ${action === 'run' && position.flip ? 'kc-cat-facing-left' : ''}`}
        style={{ '--cat-x': `${position.x}%`, '--cat-y': `${position.y}%` } as CSSProperties}
      >
        {action === 'cute' && <>
          <span className="kc-cat-heart kc-cat-heart-one">♥</span>
          <span className="kc-cat-heart kc-cat-heart-two">♥</span>
          <span className="kc-cat-spark kc-cat-spark-one">✦</span>
          <span className="kc-cat-spark kc-cat-spark-two">✦</span>
        </>}
        <div className="kc-cat-shadow" />
        <div className="kc-cat-groom">
          {action === 'run' ? (
            <div className="kc-cat-run-sprite" role="img" aria-label="灰白色 KICKS CENTER Q 版店貓逐格奔跑" />
          ) : action === 'groom' ? (
            <div className="kc-cat-groom-sprite" role="img" aria-label="灰白色 KICKS CENTER Q 版店貓逐格舔爪擦臉" />
          ) : action === 'play' ? (
            <div className="kc-cat-play-sprite" role="img" aria-label="灰白色 KICKS CENTER Q 版店貓逐格撲玩毛線球" />
          ) : action === 'roll' ? (
            <div className="kc-cat-roll-sprite" role="img" aria-label="灰白色 KICKS CENTER Q 版店貓逐格翻滾" />
          ) : (
            <div className="kc-cat-cute-sprite" role="img" aria-label="灰白色 KICKS CENTER Q 版店貓逐格舉爪裝可愛" />
          )}
          {action === 'cute' && <>
            <span className="kc-cat-blush kc-cat-blush-left" />
            <span className="kc-cat-blush kc-cat-blush-right" />
          </>}
        </div>
      </div>

      <div className="kc-idle-copy">
        <div className="kc-idle-kicker">CAT ON DUTY · 待機巡店中</div>
        <h2>{action === 'run' ? '店貓巡邏中，抓得到我嗎？' : action === 'groom' ? '稍等一下，讓我舔舔毛 ฅ^•ﻌ•^ฅ' : action === 'play' ? '發現玩具！撲過去！' : action === 'roll' ? '翻一圈，再翻一圈！' : '今天也要負責可愛 ♡'}</h2>
        <p>牠會真的跑動、追玩具、舔毛、翻滾和休息</p>
        <button onClick={() => setVisible(false)}>繼續使用 POS</button>
        <small>移動滑鼠、觸碰畫面或按任意鍵也可以喚醒</small>
      </div>
    </div>
  );
}

declare global {
  interface WindowEventMap {
    'kicks-preview-idle-cat': Event;
  }
}
