import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SurveyScreen from './src/screens/SurveyScreen';
import DetailScreen from './src/screens/DetailScreen';
import GpsSourceScreen from './src/screens/GpsSourceScreen';
import AltitudeScreen from './src/screens/AltitudeScreen';
import WeatherScreen from './src/screens/WeatherScreen';
import { colors } from './src/theme';

const SCREENS = {
  home: HomeScreen,
  survey: SurveyScreen,
  detail: DetailScreen,
  gps: GpsSourceScreen,
  altitude: AltitudeScreen,
  weather: WeatherScreen,
};

let nextKey = 1;

// Navegación en pila muy simple: las pantallas de abajo siguen montadas (ocultas),
// así una medición en curso no se pierde al abrir Altitud o Clima.
export default function App() {
  const [stack, setStack] = useState([{ name: 'home', params: undefined, key: 0 }]);

  // Reemplaza toda la pila (ir a una sección principal)
  const navigate = useCallback((name, params) => {
    setStack([{ name, params, key: nextKey++ }]);
  }, []);
  // Abre una pantalla encima de la actual
  const push = useCallback((name, params) => {
    setStack((s) => [...s, { name, params, key: nextKey++ }]);
  }, []);
  // Vuelve a la pantalla anterior (o al inicio)
  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: 'home', params: undefined, key: nextKey++ }]));
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.header }} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        {stack.map((r, i) => {
          const Screen = SCREENS[r.name] || HomeScreen;
          const active = i === stack.length - 1;
          return (
            <View key={r.key} style={{ flex: 1, display: active ? 'flex' : 'none' }}>
              <Screen
                navigate={navigate}
                push={push}
                goBack={goBack}
                params={r.params}
                active={active}
                canGoBack={stack.length > 1}
              />
            </View>
          );
        })}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
