import { requireOptionalNativeModule } from 'expo';

// null cuando el módulo nativo no está (Expo Go, web, iOS).
const BluetoothGnss = requireOptionalNativeModule('BluetoothGnss');

export default BluetoothGnss;
