// Deno жаһандық объектісінің бізге керек бөлігі (tsc тексеруі үшін; іске қосылғанда Deno өзі береді)
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
  const env: { get(name: string): string | undefined };
}
