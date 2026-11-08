import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SurveyScreen from './src/screens/SurveyScreen';
import DetailScreen from './src/screens/DetailScreen';
import GpsSourceScreen from './src/screens/GpsSourceScreen';
import { colors } from './src/theme';

const SCREENS = { home: HomeScreen, survey: SurveyScreen, detail: DetailScreen, gps: GpsSourceScreen };

export default function App() {
  const [route, setRoute] = useState({ name: 'home', params: undefined, key: 0 });

  const navigate = useCallback((name, params) => {
    setRoute((r) => ({ name, params, key: r.key + 1 }));
  }, []);

  const Screen = SCREENS[route.name] || HomeScreen;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <Screen key={route.key} navigate={navigate} params={route.params} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
