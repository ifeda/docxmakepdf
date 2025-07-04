import { createConfig } from "./share/tsup.config.js";
export default createConfig({
  copy: ["./src/vfs_fonts.js","README.MD","build-vfs.js"],
  entry: ["src/index.ts"],
  external: ["./vfs_fonts.js"],
  dts: true,
});