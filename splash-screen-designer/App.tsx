import React from 'react';
import { StatusBar } from 'expo-status-bar';
import DesignerScreen from './src/screens/DesignerScreen';

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <DesignerScreen />
    </>
  );
}
