"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>Houve um problema ao abrir esta página.</h1>
      <p>
        Seus registros salvos continuam no banco. Confira sua conexão e tente
        novamente.
      </p>
      <button className="primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
