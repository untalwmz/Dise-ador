import React from 'react';
import { View, Pressable, StyleSheet, Text, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ICON_NAMES } from '../constants/presets';
import { IconSource, PresetIconName } from '../types';

const ICON_MAP: Record<PresetIconName, keyof typeof Ionicons.glyphMap> = {
  rocket: 'rocket',
  leaf: 'leaf',
  coffee: 'cafe',
  bolt: 'flash',
  shield: 'shield-checkmark',
  star: 'star',
  heart: 'heart',
  cloud: 'cloud',
};

export default function IconPicker({
  value,
  accentColor,
  onChange,
}: {
  value: IconSource;
  accentColor: string;
  onChange: (icon: IconSource) => void;
}) {
  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso necesario', 'Activa el acceso a tus fotos para elegir un ícono personalizado.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      onChange({ kind: 'custom', uri: result.assets[0].uri });
    }
  };

  return (
    <View>
      <View style={styles.grid}>
        {ICON_NAMES.map((name) => {
          const active = value.kind === 'preset' && value.name === name;
          return (
            <Pressable
              key={name}
              onPress={() => onChange({ kind: 'preset', name })}
              style={[styles.tile, active && styles.tileActive]}
            >
              <Ionicons name={ICON_MAP[name]} size={24} color={active ? accentColor : '#94A3B8'} />
            </Pressable>
          );
        })}
        <Pressable style={[styles.tile, value.kind === 'custom' && styles.tileActive]} onPress={pickFromGallery}>
          <Ionicons name="image-outline" size={22} color={value.kind === 'custom' ? accentColor : '#94A3B8'} />
        </Pressable>
      </View>
      {value.kind === 'custom' && (
        <Text style={styles.hint}>Usando imagen de tu galería como ícono.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#161B26',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileActive: { borderColor: '#38BDF8', backgroundColor: '#1E293B' },
  hint: { color: '#64748B', fontSize: 12, marginTop: 8 },
});
