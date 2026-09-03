"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef } from "react";
import { KC_AI_QUICK_QUESTIONS } from "@/lib/kc-ai-knowledge";
import { useKcAi } from "@/app/kc-ai-context";

export function KcAiAssistant() {
  const {
    open,
    setOpen,
    input,
    setInput,
    messages,
    typing,
    send,
    clearConversation,
  } = useKcAi();
  const scrollArea = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") setOpen(false);
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70] sm:bottom-6 sm:right-6">
      {open && (
        <section
          id="kc-ai-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="kc-ai-title"
          className="mb-3 flex h-[min(680px,calc(100vh-104px))] w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-[#3b4652] bg-[#171c22] shadow-[0_28px_90px_rgba(0,0,0,.62)] sm:w-[430px]"
        >
          <header className="flex items-center justify-between border-b border-[#303944] bg-[#1d232b] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#e8893a]/35 bg-[#e8893a]/10 text-xs font-black tracking-tight text-[#f09a52]">AI</div>
              <div>
                <h2 id="kc-ai-title" className="text-sm font-black tracking-[.08em] text-[#f4f5f6]">KC AI</h2>
                <p className="mt-0.5 text-[10px] font-semibold tracking-[.06em] text-[#7f8a96]">KICKS CENTER 智慧助理</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={clearConversation} className="rounded-lg px-3 py-2 text-[10px] font-bold text-[#89939e] hover:bg-white/5 hover:text-white">清除對話</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="關閉 KC AI" className="grid h-9 w-9 place-items-center rounded-lg text-lg text-[#89939e] hover:bg-white/5 hover:text-white">×</button>
            </div>
          </header>

          <div ref={scrollArea} className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            <div className="mb-5 flex gap-3">
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#e8893a] text-[9px] font-black text-[#17120e]">KC</div>
              <div className="max-w-[82%] rounded-2xl rounded-tl-md border border-[#303944] bg-[#222a33] px-4 py-3 text-sm leading-6 text-[#dce0e4]">有什麼可以幫你？</div>
            </div>

            {messages.length === 0 && (
              <div className="mb-5 pl-10">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#66717d]">常用操作</p>
                <div className="flex flex-wrap gap-2">
                  {KC_AI_QUICK_QUESTIONS.map((question) => (
                    <button key={question} type="button" onClick={() => void send(question)} className="rounded-xl border border-[#3b4652] bg-[#1d232b] px-3 py-2 text-left text-[11px] font-semibold text-[#b9c0c7] transition hover:border-[#e8893a]/60 hover:text-[#f09a52]">
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "assistant" && <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#e8893a] text-[9px] font-black text-[#17120e]">KC</div>}
                  <div className={`max-w-[84%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-tr-md bg-[#e8893a] font-semibold text-[#17120e]" : "rounded-tl-md border border-[#303944] bg-[#222a33] text-[#dce0e4]"}`}>
                    {message.text}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex items-center gap-3" aria-label="KC AI 正在輸入">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#e8893a] text-[9px] font-black text-[#17120e]">KC</div>
                  <div className="flex gap-1 rounded-2xl rounded-tl-md border border-[#303944] bg-[#222a33] px-4 py-4">
                    {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e8893a]" style={{ animationDelay: `${dot * 140}ms` }} />)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={submit} className="border-t border-[#303944] bg-[#1d232b] p-3 sm:p-4">
            <div className="flex items-center gap-2 rounded-2xl border border-[#3b4652] bg-[#151a20] p-2 focus-within:border-[#e8893a]/70">
              <textarea rows={1} maxLength={800} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleInputKeyDown} disabled={typing} aria-label="詢問 KICKS CENTER 操作方式" placeholder="詢問 KICKS CENTER 操作方式⋯" className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-[#59636e] disabled:opacity-60" />
              <button type="submit" disabled={!input.trim() || typing} className="rounded-xl bg-[#e8893a] px-4 py-2.5 text-xs font-black text-[#17120e] transition hover:bg-[#f09a52] disabled:cursor-not-allowed disabled:opacity-35">送出</button>
            </div>
            <p className="mt-2 text-center text-[9px] text-[#59636e]">KC AI 1.1 · Enter 送出，Shift + Enter 換行 · 不讀取或修改營運資料</p>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="kc-ai-panel"
        className="ml-auto flex h-14 items-center gap-2.5 rounded-2xl border border-[#e8893a]/45 bg-[#171c22] px-5 text-sm font-black tracking-[.06em] text-white shadow-[0_14px_40px_rgba(0,0,0,.5)] transition hover:-translate-y-0.5 hover:border-[#e8893a] hover:bg-[#1d232b]"
      >
        <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-[#e8893a] text-[9px] font-black text-[#17120e]">AI<span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[#171c22] bg-[#74bb96]" /></span>
        KC AI 助理
      </button>
    </div>
  );
}
