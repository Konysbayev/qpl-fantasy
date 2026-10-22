// Deno жаһандық объектісінің бізге керек бөлігі (tsc тексеруі үшін; іске қосылғанда Deno өзі береді)
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
  const env: { get(name: string): string | undefined };
}

// Deno npm: импорты — Node-тағы пакеттің типтерімен
declare module 'npm:postgres@3.4.7' {
  import postgres from 'postgres';
  export default postgres;
}
