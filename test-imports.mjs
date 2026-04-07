import { posts } from "./src/data/posts.js";
console.log("posts count:", posts.length);
console.log("first slug:", posts[0]?.slug);
console.log("first content len:", posts[0]?.content?.length);
