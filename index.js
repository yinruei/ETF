import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/index.js`);
require("./server");
