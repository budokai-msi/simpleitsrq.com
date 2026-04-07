import http from "http";
const req = http.get("http://localhost:4321/assets/index-VRxKiLfk.js", (res) => {
  let data = "";
  res.on("data", c => data += c);
  res.on("end", () => {
    // search for things that often cause crash
    const lines = data.split("\n");
    console.log("size:", data.length);
    // Look for "undefined" being called as component
    const idx = data.indexOf("createElement(void 0");
    console.log("createElement(void 0) at:", idx);
    const idx2 = data.indexOf("React.createElement(undefined");
    console.log("React.createElement(undefined) at:", idx2);
  });
});
req.on("error", e => console.log("err:", e.message));
