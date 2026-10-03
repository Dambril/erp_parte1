import React, {useEffect, useState} from 'react';
import {StyleSheet, TextInput} from 'react-native';
import {colors, radii, touchTarget} from '@erp/ui';

interface Props {
  placeholder: string;
  /** Recibe el texto ya recortado cuando la persona deja de escribir; la búsqueda la hace la API. */
  onSearch: (query: string) => void;
}

export function SearchInput({placeholder, onSearch}: Props): React.ReactElement {
  const [text, setText] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, onSearch]);

  return (
    <TextInput
      value={text}
      onChangeText={setText}
      placeholder={placeholder}
      placeholderTextColor={colors.stone}
      accessibilityLabel={placeholder}
      returnKeyType="search"
      style={styles.search}
    />
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.white,
    color: colors.ink,
  },
});
