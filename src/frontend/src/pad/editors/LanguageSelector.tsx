import React from 'react';

interface LanguageSelectorProps {
  value: string;
  onChange: (language: string) => void;
  className?: string;
}

// Language options based on Monaco editor supported languages
const languageOptions = [
  { value: '', label: 'Select an example...', disabled: true, hidden: true },
  { value: 'plaintext', label: 'plaintext' },
  { value: 'abap', label: 'abap' },
  { value: 'apex', label: 'apex' },
  { value: 'azcli', label: 'azcli' },
  { value: 'bat', label: 'bat' },
  { value: 'bicep', label: 'bicep' },
  { value: 'cameligo', label: 'cameligo' },
  { value: 'clojure', label: 'clojure' },
  { value: 'coffeescript', label: 'coffeescript' },
  { value: 'c', label: 'c' },
  { value: 'cpp', label: 'cpp' },
  { value: 'csharp', label: 'csharp' },
  { value: 'csp', label: 'csp' },
  { value: 'css', label: 'css' },
  { value: 'cypher', label: 'cypher' },
  { value: 'dart', label: 'dart' },
  { value: 'dockerfile', label: 'dockerfile' },
  { value: 'ecl', label: 'ecl' },
  { value: 'elixir', label: 'elixir' },
  { value: 'flow9', label: 'flow9' },
  { value: 'fsharp', label: 'fsharp' },
  { value: 'freemarker2', label: 'freemarker2' },
  { value: 'freemarker2.tag-angle.interpolation-dollar', label: 'freemarker2.tag-angle.interpolation-dollar' },
  { value: 'freemarker2.tag-bracket.interpolation-dollar', label: 'freemarker2.tag-bracket.interpolation-dollar' },
  { value: 'freemarker2.tag-angle.interpolation-bracket', label: 'freemarker2.tag-angle.interpolation-bracket' },
  { value: 'freemarker2.tag-bracket.interpolation-bracket', label: 'freemarker2.tag-bracket.interpolation-bracket' },
  { value: 'freemarker2.tag-auto.interpolation-dollar', label: 'freemarker2.tag-auto.interpolation-dollar' },
  { value: 'freemarker2.tag-auto.interpolation-bracket', label: 'freemarker2.tag-auto.interpolation-bracket' },
  { value: 'go', label: 'go' },
  { value: 'graphql', label: 'graphql' },
  { value: 'handlebars', label: 'handlebars' },
  { value: 'hcl', label: 'hcl' },
  { value: 'html', label: 'html' },
  { value: 'ini', label: 'ini' },
  { value: 'java', label: 'java' },
  { value: 'javascript', label: 'javascript' },
  { value: 'julia', label: 'julia' },
  { value: 'kotlin', label: 'kotlin' },
  { value: 'less', label: 'less' },
  { value: 'lexon', label: 'lexon' },
  { value: 'lua', label: 'lua' },
  { value: 'liquid', label: 'liquid' },
  { value: 'm3', label: 'm3' },
  { value: 'markdown', label: 'markdown' },
  { value: 'mdx', label: 'mdx' },
  { value: 'mips', label: 'mips' },
  { value: 'msdax', label: 'msdax' },
  { value: 'mysql', label: 'mysql' },
  { value: 'objective-c', label: 'objective-c' },
  { value: 'pascal', label: 'pascal' },
  { value: 'pascaligo', label: 'pascaligo' },
  { value: 'perl', label: 'perl' },
  { value: 'pgsql', label: 'pgsql' },
  { value: 'php', label: 'php' },
  { value: 'pla', label: 'pla' },
  { value: 'postiats', label: 'postiats' },
  { value: 'powerquery', label: 'powerquery' },
  { value: 'powershell', label: 'powershell' },
  { value: 'proto', label: 'proto' },
  { value: 'pug', label: 'pug' },
  { value: 'python', label: 'python' },
  { value: 'qsharp', label: 'qsharp' },
  { value: 'r', label: 'r' },
  { value: 'razor', label: 'razor' },
  { value: 'redis', label: 'redis' },
  { value: 'redshift', label: 'redshift' },
  { value: 'restructuredtext', label: 'restructuredtext' },
  { value: 'ruby', label: 'ruby' },
  { value: 'rust', label: 'rust' },
  { value: 'sb', label: 'sb' },
  { value: 'scala', label: 'scala' },
  { value: 'scheme', label: 'scheme' },
  { value: 'scss', label: 'scss' },
  { value: 'shell', label: 'shell' },
  { value: 'sol', label: 'sol' },
  { value: 'aes', label: 'aes' },
  { value: 'sparql', label: 'sparql' },
  { value: 'sql', label: 'sql' },
  { value: 'st', label: 'st' },
  { value: 'swift', label: 'swift' },
  { value: 'systemverilog', label: 'systemverilog' },
  { value: 'verilog', label: 'verilog' },
  { value: 'tcl', label: 'tcl' },
  { value: 'twig', label: 'twig' },
  { value: 'typescript', label: 'typescript' },
  { value: 'typespec', label: 'typespec' },
  { value: 'vb', label: 'vb' },
  { value: 'wgsl', label: 'wgsl' },
  { value: 'xml', label: 'xml' },
  { value: 'yaml', label: 'yaml' },
  { value: 'json', label: 'json' }
];

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  value,
  onChange,
  className = 'editor__language-selector'
}) => {
  return (
    <div className={className}>
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        className="editor__language-select"
      >
        {languageOptions.map((option) => (
          <option 
            key={option.value} 
            value={option.value}
            disabled={option.disabled}
            hidden={option.hidden}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSelector;
