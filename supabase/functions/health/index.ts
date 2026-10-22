// Жариялау жолын тексеру: сервер уақытын қайтарады
Deno.serve(() => Response.json({ ok: true, time: new Date().toISOString() }));
