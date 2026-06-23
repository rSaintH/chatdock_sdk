export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Next.js App Router example</p>
        <h1>Chatdock SDK with local model, auth, persistence, and tools.</h1>
        <p className="lede">
          This app runs without provider keys. The chat route uses the SDK handler, an in-memory
          history adapter, a demo auth adapter, and a generated tools registry.
        </p>
        <div className="actions" aria-label="Suggested prompts">
          <span>Try the launcher</span>
          <span>Ask for current status</span>
          <span>No API key required</span>
        </div>
      </section>

      <section className="grid" aria-label="Example coverage">
        <article>
          <h2>App route</h2>
          <p>`app/api/chat/route.ts` delegates to `createNextChatbotRoute`.</p>
        </article>
        <article>
          <h2>Local runtime</h2>
          <p>The model is deterministic and lives in `src/chatbot/local-model.ts`.</p>
        </article>
        <article>
          <h2>Tool registry</h2>
          <p>`get_status` is exported through `src/chatbot/tools.generated.ts`.</p>
        </article>
      </section>
    </main>
  );
}
