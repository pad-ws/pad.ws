import React, { useState, useRef, useEffect } from 'react';

interface SearchableLanguageSelectorProps {
  value: string;
  onChange: (language: string) => void;
  className?: string;
}

// Language options based on Monaco editor supported languages
const languageOptions = [
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

const SearchableLanguageSelector: React.FC<SearchableLanguageSelectorProps> = ({
  value,
  onChange,
  className = 'editor__language-selector'
}) => {
  const [searchText, setSearchText] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState(languageOptions);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find the current language label
  const currentLanguageLabel = languageOptions.find(option => option.value === value)?.label || value;

  // Filter options based on search text
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredOptions(languageOptions);
      return;
    }

    const searchLower = searchText.toLowerCase();
    const filtered = languageOptions.filter(option => 
      option.label.toLowerCase().includes(searchLower)
    );

    // Sort results: exact matches first, then starts with, then includes
    filtered.sort((a, b) => {
      const aLower = a.label.toLowerCase();
      const bLower = b.label.toLowerCase();
      
      // Exact match
      if (aLower === searchLower && bLower !== searchLower) return -1;
      if (bLower === searchLower && aLower !== searchLower) return 1;
      
      // Starts with
      if (aLower.startsWith(searchLower) && !bLower.startsWith(searchLower)) return -1;
      if (bLower.startsWith(searchLower) && !aLower.startsWith(searchLower)) return 1;
      
      // Alphabetical order
      return aLower.localeCompare(bLower);
    });

    setFilteredOptions(filtered);
    setHighlightedIndex(filtered.length > 0 ? 0 : -1);
  }, [searchText]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        // Reset search text to current selection when closing
        setSearchText('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
    // Only open dropdown if there's text to search
    if (e.target.value.trim()) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
    }
  };

  const handleOptionClick = (optionValue: string) => {
    onChange(optionValue);
    setIsDropdownOpen(false);
    setSearchText('');
    inputRef.current?.blur();
  };

  const handleInputFocus = () => {
    // Don't open dropdown on focus, only when typing or clicking the arrow
  };

  const handleToggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
    if (!isDropdownOpen) {
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        setIsDropdownOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        setHighlightedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        e.preventDefault();
        break;
      case 'ArrowUp':
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        e.preventDefault();
        break;
      case 'Enter':
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleOptionClick(filteredOptions[highlightedIndex].value);
          e.preventDefault();
        }
        break;
      case 'Escape':
        setIsDropdownOpen(false);
        setSearchText('');
        inputRef.current?.blur();
        e.preventDefault();
        break;
      case 'Tab':
        setIsDropdownOpen(false);
        setSearchText('');
        break;
    }
  };

  return (
    <div className={className} ref={dropdownRef}>
      <div className="editor__searchable-language-container">
        <input
          ref={inputRef}
          type="text"
          className="editor__searchable-language-input"
          placeholder={currentLanguageLabel}
          value={searchText}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          aria-label="Search for a language"
        />
        <button 
          className="editor__searchable-language-toggle"
          onClick={handleToggleDropdown}
          aria-label="Toggle language list"
        >
          <svg 
            width="10" 
            height="6" 
            viewBox="0 0 10 6" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            style={{ transform: isDropdownOpen ? 'rotate(0deg)' : 'rotate(180deg)' }}
          >
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      
      {isDropdownOpen && (
        <div className="editor__searchable-language-dropdown">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <div
                key={option.value}
                className={`editor__searchable-language-option ${
                  index === highlightedIndex ? 'editor__searchable-language-option--highlighted' : ''
                } ${option.value === value ? 'editor__searchable-language-option--selected' : ''}`}
                onClick={() => handleOptionClick(option.value)}
              >
                {option.label}
              </div>
            ))
          ) : (
            <div className="editor__searchable-language-no-results">No matches found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableLanguageSelector;
