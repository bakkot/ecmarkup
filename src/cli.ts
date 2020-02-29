import { parseArgs } from './args';
const args = parseArgs();


// requires after arg checking to avoid expensive load times
import { build as ecmarkupBuild } from './ecmarkup';
import * as fs from 'fs';
import * as utils from './utils';
import debounce from 'promise-debounce';
var __awaiter = require('./awaiter'); // eslint-disable-line no-var

// back compat to old argument names
if (args.css) {
  args.cssOut = args.css;
}

if (args.js) {
  args.jsOut = args.js;
}

const watching = new Map<string, any>();
const build: () => Promise<void> = debounce(async function build() : Promise<void> {
  try {
    const spec = await ecmarkupBuild(args.infile, utils.readFile, args);

    const pending: Promise<any>[] = [];
    if (args.biblio) {
      if (args.verbose) {
        utils.logVerbose('Writing biblio file to ' + args.biblio);
      }
      pending.push(utils.writeFile(args.biblio, JSON.stringify(spec.exportBiblio())));
    }

    if (args.outfile) {
      if (args.verbose) {
        utils.logVerbose('Writing output to ' + args.outfile);
      }
      pending.push(utils.writeFile(args.outfile, spec.toHTML()));
    } else {
      process.stdout.write(spec.toHTML());
    }

    await Promise.all(pending);

    if (args.watch) {
      const toWatch = new Set<string>(spec.imports.map(i => i.importLocation).concat(args.infile));

      // remove any files that we're no longer watching
      for (const [file, watcher] of watching) {
        if (!toWatch.has(file)) {
          watcher.close();
          watching.delete(file);
        }
      }

      // watch any new files
      for (const file of toWatch) {
        if (!watching.has(file)) {
          watching.set(file, fs.watch(file, build));
        }
      }
    }
  } catch (e) {
    process.stderr.write(e.stack);
  }
});

build().catch(e => {
  console.error(e);
  process.exit(1);
});