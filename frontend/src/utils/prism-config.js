// PrismJS Configuration for SimplePage
// This file configures PrismJS with essential languages

// Core PrismJS
import Prism from 'prismjs';

// Top programming languages (including Solidity)
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
// import 'prismjs/components/prism-cpp'; // broken
import 'prismjs/components/prism-csharp';
// import 'prismjs/components/prism-php'; // broken
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-dart';
import 'prismjs/components/prism-elixir';
import 'prismjs/components/prism-haskell';
import 'prismjs/components/prism-clojure';
import 'prismjs/components/prism-fsharp';
import 'prismjs/components/prism-solidity';

// Additional useful components
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';


export const highlightElement = (element) => {
  Prism.highlightAllUnder(element);
};