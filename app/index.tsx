import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from "react";
import { Button, Platform, StyleSheet, Text, View } from "react-native";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function Index() {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>('');
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    // Request notification permissions
    registerForPushNotificationsAsync().then(token => setExpoPushToken(token));

    // Listen for notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  const scheduleNotification = async () => {
    try {
      // Cancel any existing notifications
      await Notifications.dismissAllNotificationsAsync();
      
      // Schedule a new notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Notification worked!",
          body: "This is a local notification test in Expo Go",
          data: { data: 'Goes here' },
        },
        trigger: null, // Show immediately
      });
      
      console.log('Notification scheduled successfully');
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  };

  // Request permissions for notifications
  async function registerForPushNotificationsAsync() {
    let token;
    
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get notification permissions!');
        return;
      }
      
      // This might not work in Expo Go, but we'll include it for completeness
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
      
      console.log('Notification permissions granted!');
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
    
    return token;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>yay the app is working</Text>
      
      <Button 
        title="Ding" 
        onPress={scheduleNotification} 
      />
      
      {notification && (
        <View style={styles.notificationInfo}>
          <Text>Last Notification: {notification.request.content.title}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 20,
  },
  title: {
    fontSize: 18,
    marginBottom: 20,
  },
  notificationInfo: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
  }
});
