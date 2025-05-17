import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Define notification categories and actions
if (Platform.OS === 'ios') {
  Notifications.setNotificationCategoryAsync('medication', [
    {
      identifier: 'taken-set-interval',
      buttonTitle: 'Taken - Set Next',
      options: {
        isDestructive: false,
        isAuthenticationRequired: false,
      },
    },
    {
      identifier: 'taken-last-dose',
      buttonTitle: 'Last Dose for Today',
      options: {
        isDestructive: false,
        isAuthenticationRequired: false,
      },
    },
    {
      identifier: 'snooze',
      buttonTitle: 'Snooze 4min',
      options: {
        isDestructive: false,
        isAuthenticationRequired: false,
      },
    },
    {
      identifier: 'cancel',
      buttonTitle: 'Cancel Reminders',
      options: {
        isDestructive: true,
        isAuthenticationRequired: false,
      },
    },
  ]);
}

// Storage keys
const STORAGE_KEYS = {
  SETUP_COMPLETE: 'setup_complete',
  FIRST_DOSE_TIME: 'first_dose_time',
  DOSE_INTERVAL: 'dose_interval',
  NEXT_DOSE_TIME: 'next_dose_time',
};

export default function Index() {
  // App state
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Setup state
  const [firstDoseTime, setFirstDoseTime] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [doseIntervalHours, setDoseIntervalHours] = useState<number>(0); // Default 0 hours
  const [doseIntervalMinutes, setDoseIntervalMinutes] = useState<number>(1); // Default 1 minute
  
  // Notification state
  const [nextDoseTime, setNextDoseTime] = useState<Date | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  // Add a new state for snooze minutes
  const [snoozeMinutes, setSnoozeMinutes] = useState<number>(4);

  // Load saved data on app start
  useEffect(() => {
    loadSavedData();
    setupNotifications();

    return () => {
      cleanup();
    };
  }, []);

  // Load any saved app state from AsyncStorage
  const loadSavedData = async () => {
    try {
      const setupComplete = await AsyncStorage.getItem(STORAGE_KEYS.SETUP_COMPLETE);
      
      if (setupComplete === 'true') {
        // Load saved settings if setup was completed before
        const savedFirstDoseTime = await AsyncStorage.getItem(STORAGE_KEYS.FIRST_DOSE_TIME);
        const savedDoseInterval = await AsyncStorage.getItem(STORAGE_KEYS.DOSE_INTERVAL);
        const savedNextDoseTime = await AsyncStorage.getItem(STORAGE_KEYS.NEXT_DOSE_TIME);
        
        if (savedFirstDoseTime) setFirstDoseTime(new Date(savedFirstDoseTime));
        if (savedDoseInterval) {
          const [hours, minutes] = savedDoseInterval.split(':').map(Number);
          setDoseIntervalHours(hours);
          setDoseIntervalMinutes(minutes);
        }
        if (savedNextDoseTime) setNextDoseTime(new Date(savedNextDoseTime));
        
        setIsSetupComplete(true);
      }
    } catch (error) {
      console.error('Error loading saved data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Set up notification listeners
  const setupNotifications = async () => {
    // Request notification permissions
    await registerForPushNotificationsAsync();

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // Listen for user interactions with notifications
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      handleNotificationResponse(response);
    });
  };

  // Clean up notification listeners
  const cleanup = () => {
    if (notificationListener.current) {
      Notifications.removeNotificationSubscription(notificationListener.current);
    }
    if (responseListener.current) {
      Notifications.removeNotificationSubscription(responseListener.current);
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
      
      // Set up Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('medication-reminders', {
          name: 'Medication Reminders',
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

  // Complete the initial setup
  const completeSetup = async () => {
    try {
      // Save setup data
      await AsyncStorage.setItem(STORAGE_KEYS.SETUP_COMPLETE, 'true');
      await AsyncStorage.setItem(STORAGE_KEYS.FIRST_DOSE_TIME, firstDoseTime.toISOString());
      await AsyncStorage.setItem(STORAGE_KEYS.DOSE_INTERVAL, `${doseIntervalHours}:${doseIntervalMinutes}`);
      
      // Schedule the first notification
      const nextDose = calculateNextDoseTime(firstDoseTime, 0);
      await scheduleNextDose(nextDose);
      
      // Update app state
      setIsSetupComplete(true);
      setNextDoseTime(nextDose);
    } catch (error) {
      console.error('Error saving setup data:', error);
    }
  };

  // Calculate the next dose time
  const calculateNextDoseTime = (baseTime: Date, intervalMultiplier: number = 1): Date => {
    const nextTime = new Date(baseTime);
    nextTime.setHours(nextTime.getHours() + (doseIntervalHours * intervalMultiplier));
    nextTime.setMinutes(nextTime.getMinutes() + (doseIntervalMinutes * intervalMultiplier));
    return nextTime;
  };

  // Schedule the next medication dose notification
  const scheduleNextDose = async (doseTime: Date) => {
    try {
      // Cancel existing notifications
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Save the next dose time
      await AsyncStorage.setItem(STORAGE_KEYS.NEXT_DOSE_TIME, doseTime.toISOString());
      setNextDoseTime(doseTime);
      
      // Schedule notification
      const scheduledTime = new Date(doseTime.getTime() - new Date().getTime()).getTime() / 1000;
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Medication Reminder",
          body: "It's time to take your medication",
          data: {
            type: 'medication_reminder',
            timestamp: doseTime.getTime(),
          },
          categoryIdentifier: 'medication',
        },
        trigger: {
          seconds: scheduledTime > 0 ? scheduledTime : 1,
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        },
      });
      
      // Schedule repeating reminder (every 2 minutes)
      scheduleRepeatingReminders(doseTime);
      
      console.log('Next dose scheduled for:', doseTime);
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  };

  // Schedule repeating reminders (every 2 minutes) until user responds
  const scheduleRepeatingReminders = async (initialDoseTime: Date) => {
    try {
      // Schedule reminders every 2 minutes for up to 1 hour (30 reminders max)
      for (let i = 1; i <= 30; i++) {
        const reminderTime = new Date(initialDoseTime);
        reminderTime.setMinutes(reminderTime.getMinutes() + (i * 2));
        
        const scheduledTime = new Date(reminderTime.getTime() - new Date().getTime()).getTime() / 1000;
        if (scheduledTime <= 0) continue; // Skip if time is in the past
        
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "REMINDER: Take your medication",
            body: "You still need to take your medication",
            data: {
              type: 'medication_reminder_repeat',
              timestamp: initialDoseTime.getTime(),
              repeatCount: i,
            },
            categoryIdentifier: 'medication',
          },
          trigger: {
            seconds: scheduledTime,
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          },
        });
      }
    } catch (error) {
      console.error('Error scheduling repeating reminders:', error);
    }
  };

  // Handle user response to a notification
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    // Extract action identifier from the response
    const actionId = response.actionIdentifier;
    
    // Handle different user responses
    switch(actionId) {
      case 'taken-set-interval':
        handleMedicationTaken();
        break;
      case 'taken-last-dose':
        handleLastDoseForDay();
        break;
      case 'snooze':
        handleSnooze();
        break;
      case 'cancel':
        handleCancelReminders();
        break;
      default:
        // Default case when user just taps the notification
        console.log('Notification tapped without specific action');
        break;
    }
  };

  // User took medication, schedule next dose from scheduled time
  const handleMedicationTaken = async () => {
    try {
      // Cancel current reminders
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Calculate and schedule next dose
      const now = new Date();
      const nextDose = calculateNextDoseTime(now);
      await scheduleNextDose(nextDose);
    } catch (error) {
      console.error('Error handling medication taken:', error);
    }
  };

  // User took medication, schedule next dose from current time
  const handleMedicationTakenFromNow = async () => {
    try {
      // Cancel current reminders
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Calculate interval in milliseconds
      const intervalMs = (doseIntervalHours * 60 * 60 * 1000) + (doseIntervalMinutes * 60 * 1000);
      
      // Schedule next dose from current time
      const now = new Date();
      const nextDose = new Date(now.getTime() + intervalMs);
      await scheduleNextDose(nextDose);
    } catch (error) {
      console.error('Error handling medication taken from now:', error);
    }
  };

  // User took last dose for the day
  const handleLastDoseForDay = async () => {
    try {
      // Cancel all notifications
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Schedule first dose for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(firstDoseTime.getHours());
      tomorrow.setMinutes(firstDoseTime.getMinutes());
      tomorrow.setSeconds(0);
      
      await scheduleNextDose(tomorrow);
    } catch (error) {
      console.error('Error handling last dose for day:', error);
    }
  };

  // User wants to snooze the reminder
  const handleSnooze = async (minutes: number = 4) => {
    try {
      // Ensure minutes is at least 1
      const snoozeMinutes = minutes <= 0 ? 4 : minutes;
      
      // Cancel current reminders
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Schedule a reminder for minutes from now
      const snoozeTime = new Date();
      snoozeTime.setMinutes(snoozeTime.getMinutes() + snoozeMinutes);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Medication Reminder",
          body: "It's time to take your medication (snoozed reminder)",
          data: {
            type: 'medication_reminder_snooze',
            timestamp: new Date().getTime(),
          },
          categoryIdentifier: 'medication',
        },
        trigger: {
          seconds: snoozeMinutes * 60,
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        },
      });
      
      setNextDoseTime(snoozeTime);
      await AsyncStorage.setItem(STORAGE_KEYS.NEXT_DOSE_TIME, snoozeTime.toISOString());
      
      console.log('Reminder snoozed until:', snoozeTime);
    } catch (error) {
      console.error('Error handling snooze:', error);
    }
  };

  // Handle cancel reminders
  const handleCancelReminders = async () => {
    try {
      // Cancel all notifications
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Clear next dose time
      setNextDoseTime(null);
      await AsyncStorage.removeItem(STORAGE_KEYS.NEXT_DOSE_TIME);
      
      console.log('All reminders cancelled');
    } catch (error) {
      console.error('Error cancelling reminders:', error);
    }
  };

  // Reset app function
  const resetApp = async () => {
    try {
      // Cancel all notifications
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Clear all stored data
      await AsyncStorage.clear();
      
      // Reset app state
      setIsSetupComplete(false);
      setFirstDoseTime(new Date());
      setDoseIntervalHours(0);
      setDoseIntervalMinutes(1);
      setNextDoseTime(null);
      
      console.log('App reset to default state');
    } catch (error) {
      console.error('Error resetting app:', error);
    }
  };

  // Handle time picker change
  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      setFirstDoseTime(selectedTime);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // First-time setup screen
  if (!isSetupComplete) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Medication Reminder Setup</Text>
        
        <View style={styles.setupSection}>
          <Text style={styles.label}>Time of first dose:</Text>
          <TouchableOpacity 
            style={styles.timePickerButton} 
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={styles.timeText}>
              {firstDoseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>
          
          {showTimePicker && (
            <DateTimePicker
              value={firstDoseTime}
              mode="time"
              is24Hour={true}
              onChange={onTimeChange}
            />
          )}
        </View>
        
        <View style={styles.setupSection}>
          <Text style={styles.label}>Time between doses (HH:MM):</Text>
          <View style={styles.intervalContainer}>
            <View style={styles.intervalInputGroup}>
              <TextInput
                style={styles.intervalInput}
                keyboardType="numeric"
                value={doseIntervalHours.toString()}
                onChangeText={(text) => {
                  const value = parseInt(text);
                  if (!isNaN(value) && value >= 0) {
                    setDoseIntervalHours(value);
                  } else if (text === '') {
                    setDoseIntervalHours(0);
                  }
                }}
                maxLength={2}
              />
              <Text style={styles.intervalLabel}>hours</Text>
            </View>
            
            <Text style={styles.intervalSeparator}>:</Text>
            
            <View style={styles.intervalInputGroup}>
              <TextInput
                style={styles.intervalInput}
                keyboardType="numeric"
                value={doseIntervalMinutes.toString()}
                onChangeText={(text) => {
                  const value = parseInt(text);
                  if (!isNaN(value) && value >= 0 && value <= 59) {
                    setDoseIntervalMinutes(value);
                  } else if (text === '') {
                    setDoseIntervalMinutes(0);
                  }
                }}
                maxLength={2}
              />
              <Text style={styles.intervalLabel}>minutes</Text>
            </View>
          </View>
        </View>
        
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={completeSetup}
        >
          <Text style={styles.buttonText}>Start Reminders</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main app screen (after setup)
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Medication Reminder</Text>
      
      <View style={styles.infoSection}>
        <Text style={styles.label}>First dose time:</Text>
        <Text style={styles.infoText}>
          {firstDoseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      
      <View style={styles.infoSection}>
        <Text style={styles.label}>Dose interval:</Text>
        <Text style={styles.infoText}>
          {`${doseIntervalHours.toString().padStart(2, '0')}:${doseIntervalMinutes.toString().padStart(2, '0')}`}
        </Text>
      </View>
      
      <View style={styles.infoSection}>
        <Text style={styles.label}>Next scheduled dose:</Text>
        <Text style={styles.infoText}>
          {nextDoseTime 
            ? nextDoseTime.toLocaleString([], { 
                hour: '2-digit', 
                minute: '2-digit',
                month: 'short',
                day: 'numeric' 
              }) 
            : 'No dose scheduled'}
        </Text>
      </View>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => handleMedicationTaken()}
        >
          <Text style={styles.buttonText}>Taken - Interval from Scheduled Time</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => handleMedicationTakenFromNow()}
        >
          <Text style={styles.buttonText}>Taken - Interval from Now</Text>
        </TouchableOpacity>
        
        <View style={styles.snoozeContainer}>
          <TouchableOpacity 
            style={styles.snoozeButton}
            onPress={() => handleSnooze(snoozeMinutes || 4)}
          >
            <Text style={styles.buttonText}>Snooze</Text>
          </TouchableOpacity>
          <View style={styles.snoozeInputContainer}>
            <TextInput
              style={styles.snoozeInput}
              keyboardType="numeric"
              value={snoozeMinutes.toString()}
              onChangeText={(text) => {
                if (text === '') {
                  setSnoozeMinutes(0);
                } else {
                  const value = parseInt(text);
                  if (!isNaN(value)) {
                     setSnoozeMinutes(value);
                  }
                }
              }}
              maxLength={3}
            />
            <Text style={styles.snoozeInputLabel}>min</Text>
          </View>
        </View>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.cancelButton]}
          onPress={() => handleLastDoseForDay()}
        >
          <Text style={styles.buttonText}>No More Reminders Today</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: '#777' }]}
          onPress={resetApp}
        >
          <Text style={styles.buttonText}>Reset App</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  setupSection: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    fontSize: 16,
    width: '100%',
  },
  timePickerButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    width: '100%',
  },
  timeText: {
    fontSize: 16,
  },
  intervalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  intervalInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  intervalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    fontSize: 18,
    width: 60,
    textAlign: 'center',
    marginRight: 5,
  },
  intervalLabel: {
    fontSize: 16,
  },
  intervalSeparator: {
    fontSize: 24,
    marginHorizontal: 10,
    fontWeight: 'bold',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 5,
    padding: 15,
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f8f8f8',
    borderRadius: 5,
  },
  infoText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonContainer: {
    width: '100%',
    marginTop: 20,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 5,
    padding: 15,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
  },
  snoozeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  snoozeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '30%',
    marginRight: 10,
  },
  snoozeInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    fontSize: 16,
    flex: 1,
    textAlign: 'center',
  },
  snoozeInputLabel: {
    marginLeft: 5,
    fontSize: 16,
  },
  snoozeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 5,
    padding: 15,
    flex: 1,
    alignItems: 'center',
    marginRight: 10,
  },
});
