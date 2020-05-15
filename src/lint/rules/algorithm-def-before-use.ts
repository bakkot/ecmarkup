import type { Node as EcmarkdownNode, ListNode, Observer } from 'ecmarkdown';
import type { Reporter } from '../algorithm-error-reporter-type';

function getSource(source: string, fragment: EcmarkdownNode[]) {
  return source.substring(fragment[0].location!.start.offset, fragment[fragment.length - 1].location!.end.offset);
}

let total = 0;
export default function (report: Reporter, node: Element, source: string, inAnnexB: boolean): Observer {
  if (inAnnexB) {
    return {};
  }

  let header = node.previousElementSibling;
  let initialDefs: Set<string> = new Set([
    // we have got to figure out a better way to handle varargs
    'argumentsList',

    // generators are dumb
    'resumptionValue',

    // this is a bug in our analysis; we are not identifying the header here
    'call',

    // https://github.com/tc39/ecma262/issues/1742
    'withEnvironment',

    // regexs are written in an unusual style
    // https://github.com/tc39/ecma262/issues/1884
    'endIndex',
    'Input',
    'InputLength',
    'captures',
    'NcapturingParens',
    'IgnoreCase',
    'Unicode',
    'DotAll',
    'Multiline',
    'direction',

    // Abstract Relational Comparison is weird
    'LeftFirst',

    // the sort functions refer to variables they were not passed
    // https://github.com/tc39/ecma262/issues/1884
    'comparefn',
  ]);

  while (header !== null && header.textContent !== null) {
    if (header.nodeName !== 'EMU-ALG') {
      // @ts-ignore we should target a version which supports matchall
      [...header.textContent.matchAll(/\b_([a-zA-Z0-9]+)_\b/gi)].forEach(m => initialDefs.add(m[1]));      
    }

    header = header.previousElementSibling;
  }

  return {
    enter(node: EcmarkdownNode) {
      if (node.name !== 'algorithm') {
        return;
      }
      let missed: string[] = [];
      let defined: Set<string> = new Set();
      (function visit(list: ListNode) {
        for (let line of list.contents) {
          let text = getSource(source, line.contents);
          // @ts-ignore we should target a version which supports matchall
          let defs = [...text.matchAll(/let (_[a-zA-Z0-9]+_(?: and _[a-zA-Z0-9]+_)?) be/gi)];
          defs.forEach(m => {
            // TODO check for no conflicts with definitions in the header
            m[1].split(' and ').forEach((v: string) => {
              defined.add(v.substring(1, v.length - 1))
            });
          });

          // TODO think about how to avoid special-casing because of oxford commas...
          // @ts-ignore we should target a version which supports matchall
          defs = [...text.matchAll(/let ((?:_[a-zA-Z0-9]+_, )+and _[a-zA-Z0-9]+_) be/gi)];
          defs.forEach(m => {
            // TODO check for no conflicts with definitions in the header
            m[1].replace('and ', '').split(', ').forEach((v: string) => {
              defined.add(v.substring(1, v.length - 1))
            });
          });

          // TODO it would be nice to scope loop variables to substeps of the loop
          //  (?:of|in|such that|that is|that satisfies|from) 
          // @ts-ignore we should target a version which supports matchall
          let loopDefs = [...text.matchAll(/For (?:each|any|all)[^_]* _([a-zA-Z0-9]+)_\b/gi)];
          loopDefs.forEach(m => {
            // TODO check for no conflicts with definitions in the header
            defined.add(m[1]);
          });

          // TODO it would be nice to scope this
          let existentialDef = text.match(/if(?:.* and)? there (?:exists|does not exist|is) (?:an?|any) [^_]* _([a-zA-Z0-9]+)_\b/i);
          if (existentialDef != null) {
            defined.add(existentialDef[1]);
          }


          // TODO fix the spec to not use this wording
          // @ts-ignore we should target a version which supports matchall
          let regexDefs = [...text.matchAll(/to obtain[^_]* _([a-zA-Z0-9]+)_\b/gi)];
          regexDefs.forEach(m => {
            // TODO check for no conflicts with definitions in the header
            defined.add(m[1]);
          });



          let isAbstractClosure = /and performs the following steps(?: atomically)? when called:/.test(text);
          if (isAbstractClosure) {
            // TODO we could do much better with checks for AOs: in particular, checking that nothing is used which is not captured
            let params = text.match(/with parameters \((_[a-zA-Z0-9]+_(?:, _[a-zA-Z0-9]+_)*)\)/);
            if (params !== null) {
              params[1].split(', ').forEach(p => {
                defined.add(p.substring(1, p.length - 1))
              });
            }
          }

          if (!isAbstractClosure) {
            // @ts-ignore we should target a version which supports matchall
            let uses = [...text.matchAll(/\b_([a-zA-Z0-9]+)_\b/gi)];
            uses.forEach(m => {
              if (!defined.has(m[1]) && !initialDefs.has(m[1])) {
                missed.push(m[1]);
              }
            });
          }

          if (line.sublist != null) {
            visit(line.sublist);
          }
        }
      })(node.contents);
      // console.log(defined);
      // process.exit(0);
      if (missed.length > 0) {
        missed = [...new Set(missed)];
        console.log('no match!!!!');
        console.log(missed.join(' '));
        console.log(source);
        // process.exit(0);
        total += missed.length;

        console.log('total', total);
      }
      return;
    },
  };
}
