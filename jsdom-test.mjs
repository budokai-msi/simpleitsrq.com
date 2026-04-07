import pkg from "jsdom";
const { JSDOM, VirtualConsole } = pkg;
const vc = new VirtualConsole();
vc.on("jsdomError", e => console.log("JSDOM-ERR:", e.detail?.message || e.message));
vc.on("error", (...a) => console.log("ERR:", a.map(x => x?.message || x).join(" ")));
JSDOM.fromURL("http://localhost:4321/", { runScripts: "dangerously", resources: "usable", virtualConsole: vc, pretendToBeVisual: true })
  .then(dom => {
    setTimeout(() => {
      const root = dom.window.document.getElementById("root");
      console.log("ROOT LEN:", root?.innerHTML?.length || 0);
      console.log("FIRST500:", (root?.innerHTML || "").slice(0, 500));
      process.exit(0);
    }, 5000);
  })
  .catch(e => { console.log("FETCH ERR:", e.message); process.exit(1); });
