const path = require("path");
const fs = require("fs");
const REQUIRE_TEXT_PATH_TEST = /\.(md|pem)$/;
const REQUIRE_BASE64_PATH_TEST = /\.(otf|ttf)$/;

function register() {
  const Module = require("module");
  const orginalLoad = Module._load;
  const cwd = process.cwd();
  Module._load = function (request, _parent) {
    if (request.match(REQUIRE_TEXT_PATH_TEST)) {
      return fs.readFileSync(
        path.join(path.dirname(_parent ? _parent.filename : cwd), request),
        "utf8"
      );
    } else if (request.match(REQUIRE_BASE64_PATH_TEST)) {
      return fs
        .readFileSync(
          path.join(path.dirname(_parent ? _parent.filename : cwd), request)
        )
        .toString("base64");
    }
    return orginalLoad.apply(this, arguments);
  };

  return () => {
    Module._load = orginalLoad;
  };
}
register();
