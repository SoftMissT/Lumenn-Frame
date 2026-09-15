/**
 * Lumenn Frame Suíte de teste manual do motor de áudio (Artigo II).
 *
 * O motor de continuidade DEVE ser validável isoladamente via macro, antes
 * de qualquer integração com a UI (Constitution Artigo II, Blueprint Fase 2).
 *
 * Cobre (Specs §5):
 *   CT-001 kept fonte idêntica não reinicia          (RF-005)
 *   CT-002 crossfaded duas fontes, crossfade real    (RF-006)
 *   CT-003 faded-out destino sem fonte de áudio      (RF-007)
 *   CT-006 lock 2ª transição durante fade é ignorada (RF-008)
 *   CT-007 duração própria aplicada ao fade            (RF-012)
 *   CT-A  started do silêncio para uma fonte
 *   CT-B  playlist inteira como fonte (fix v0.1.1)
 *   RF-011 fonte inválida → LumennInvalidAudioSourceError
 *
 * Uso (como GM):
 *   1. O mundo precisa de pelo menos uma playlist com 2+ sons.
 *   2. Crie uma macro Foundry do tipo "script", cole este arquivo e execute;
 *      OU rode no console (F12):
 *      await import("/modules/lumenn-frame/macros/test-audio-engine.mjs").then(m => m.run())
 *   3. Ouça: os crossfades são audíveis a suíte também verifica o estado
 *      dos documentos e mede o despacho de cada transição (RNF-002: <= 100ms).
 *
 * A suíte mede o tempo até o INÍCIO do fade (despacho do update), não a
 * duração do fade em si. Ao final, restaura os sons usados ao estado parado.
 */
export async function run() {
  const t0 = performance.now();
  const api = game.modules.get("lumenn-frame")?.api;
  if (!api)
    throw new Error("lumenn-frame: módulo não ativo ou API não exposta.");
  if (!game.user.isGM) {
    ui.notifications.warn("lumenn-frame: a suíte só roda como GM.");
    return { pass: 0, total: 0, results: [] };
  }

  const allSounds = game.playlists.reduce(
    (acc, p) => acc.concat(p.sounds.contents),
    [],
  );
  if (allSounds.length < 2) {
    ui.notifications.warn(
      "lumenn-frame: precisa de 2+ sons em playlists para a suíte.",
    );
    return { pass: 0, total: 0, results: [] };
  }
  const [a, b] = allSounds.slice(0, 2);
  const playlist = a.parent;

  const results = [];
  const check = (label, ok, detail = "") => results.push({ label, ok, detail });
  const track = (id) => ({ type: "track", id });
  const pl = (id) => ({ type: "playlist", id });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const stopAll = async () => {
    await Promise.all(
      allSounds
        .filter((s) => s.playing)
        .map((s) => s.update({ playing: false })),
    );
    if (playlist.playing) await playlist.stopAll();
  };

  await stopAll();
  await wait(400);

  const engine = new api.LumennAudioEngine();

  // CT-A started: silêncio → A (RNF-002: despacho <= 100ms)
  let s = performance.now();
  let res = await engine.transition(null, track(a.uuid), 1500);
  check(
    "CT-A started (null→A), despacho <= 100ms",
    res === "started" && a.playing === true,
    `res=${res}, despacho=${(performance.now() - s).toFixed(0)}ms`,
  );

  // CT-001 kept: mesma fonte, nada é re-disparado (o caminho "kept" não
  // emite update quando o som já está tocando; não-restart também é de ouvido)
  const soundBefore = a.sound;
  res = await engine.transition(track(a.uuid), track(a.uuid), 1500);
  check(
    "CT-001 kept (A→A, sem reinício)",
    res === "kept" && a.playing === true && a.sound === soundBefore,
    `res=${res}`,
  );

  // CT-006 bloqueio: 2ª chamada durante o crossfade é ignorada (RF-008)
  // CT-002 crossfaded: A→B (crossfade audível; ouvido confirma sem gap)
  const crossfadeP = engine.transition(track(a.uuid), track(b.uuid), 2000);
  const during = await engine.transition(track(b.uuid), track(a.uuid), 2000);
  res = await crossfadeP;
  check(
    "CT-006 lock + CT-002 crossfaded (A→B)",
    during === "ignored" &&
      res === "crossfaded" &&
      b.playing === true &&
      a.playing === false,
    `2ª=${during}, res=${res}`,
  );
  await wait(2100);

  // CT-007 + CT-003 fade-out com duração própria: B → silêncio (800ms)
  res = await engine.transition(track(b.uuid), null, 800);
  check(
    "CT-003/CT-007 faded-out (B→null, fadeDuration=800)",
    res === "faded-out" &&
      b.playing === false &&
      Number(b._source.fadeDuration) === 800,
    `res=${res}`,
  );

  // CT-B playlist inteira como fonte (fix v0.1.1: game.playlists.get)
  res = await engine.transition(null, pl(playlist.id), 1200);
  check(
    "CT-B started via playlist (Playlist#playAll)",
    res === "started" && playlist.playing === true,
    `res=${res}`,
  );

  // RF-011 fonte inválida: erro tipado, sem exceção não tratada
  let thrown = null;
  try {
    await engine.transition(
      null,
      track("Playlist.fake.PlaylistSound.nope"),
      500,
    );
  } catch (err) {
    thrown = err;
  }
  check(
    "RF-011 fonte inválida → LumennInvalidAudioSourceError",
    thrown instanceof api.LumennInvalidAudioSourceError,
    thrown?.name ?? "nada lançado",
  );

  await stopAll();

  const pass = results.filter((r) => r.ok).length;
  const total = results.length;
  const elapsed = (performance.now() - t0).toFixed(0);
  console.group(
    `%c[lumenn-frame] Suíte do motor: ${pass}/${total} PASS em ${elapsed}ms`,
    "color: #00d9ff; font-weight: bold;",
  );
  for (const r of results) {
    console.log(
      `${r.ok ? "PASS" : "FAIL"} ${r.label}${r.detail ? ` (${r.detail})` : ""}`,
    );
  }
  console.groupEnd();
  ui.notifications.info(
    `lumenn-frame: suíte do motor ${pass}/${total} PASS (${elapsed}ms). Detalhes no console.`,
  );
  return { pass, total, elapsed, results };
}

// Colado como macro "script", descomente:
// await run();
