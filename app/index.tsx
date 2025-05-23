import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

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
  ENABLE_DOSE_INTERVALS: 'enable_dose_intervals',
  ENABLE_RECURRING_REMINDERS: 'enable_recurring_reminders',
};

export default function Index() {
  // App state
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [enableDoseIntervals, setEnableDoseIntervals] = useState<boolean>(true);
  const [enableRecurringReminders, setEnableRecurringReminders] = useState<boolean>(true);
  const [isUpdatingSetup, setIsUpdatingSetup] = useState<boolean>(false);

  // Setup state
  const [firstDoseTime, setFirstDoseTime] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [showTakenTimePicker, setShowTakenTimePicker] = useState<boolean>(false);
  const [showNextSchedulePicker, setShowNextSchedulePicker] = useState<boolean>(false);
  const [doseIntervalHours, setDoseIntervalHours] = useState<number>(0);
  const [doseIntervalMinutes, setDoseIntervalMinutes] = useState<number>(0);
  const [doseIntervalTensHours, setDoseIntervalTensHours] = useState<number>(0);
  const [doseIntervalTensMinutes, setDoseIntervalTensMinutes] = useState<number>(0);
  
  // Notification state
  const [nextDoseTime, setNextDoseTime] = useState<Date | null>(null);
  const [nextReminderTime, setNextReminderTime] = useState<Date | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  // Add a new state for snooze minutes
  const [snoozeMinutes, setSnoozeMinutes] = useState<number>(4);

  // Add new function to check and update next dose time
  const checkAndUpdateNextDoseTime = async () => {
    try {
      if (!nextDoseTime) return;

      const now = new Date();
      const nextDose = new Date(nextDoseTime);

      // If next dose is in the past, update it to today's first dose time
      if (nextDose.getTime() < now.getTime()) {
        // Create new date for today using the user's configured first dose time
        const newNextDose = new Date();
        newNextDose.setHours(firstDoseTime.getHours());
        newNextDose.setMinutes(firstDoseTime.getMinutes());
        newNextDose.setSeconds(0);
        newNextDose.setMilliseconds(0);

        // If the first dose time has already passed today, schedule for tomorrow
        if (newNextDose.getTime() < now.getTime()) {
          newNextDose.setDate(newNextDose.getDate() + 1);
        }

        // Update the next dose time
        await scheduleNextDose(newNextDose);
        console.log('Updated next dose time to first dose time:', newNextDose);
      }
    } catch (error) {
      console.error('Error checking and updating next dose time:', error);
    }
  };

  // Schedule daily check at 12:01 AM
  const scheduleDailyCheck = async () => {
    try {
      // Cancel any existing daily check notifications
      await Notifications.cancelScheduledNotificationAsync('daily-check');

      // Calculate time until next 12:01 AM
      const now = new Date();
      const nextCheck = new Date();
      nextCheck.setHours(0, 1, 0, 0); // Set to 12:01 AM
      
      // If it's already past 12:01 AM, schedule for tomorrow
      if (now.getTime() >= nextCheck.getTime()) {
        nextCheck.setDate(nextCheck.getDate() + 1);
      }

      // Calculate seconds until next check
      const secondsUntilCheck = Math.floor((nextCheck.getTime() - now.getTime()) / 1000);

      // Schedule the daily check notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Daily Check",
          body: "Checking medication schedule",
          data: { type: 'daily_check' },
        },
        trigger: {
          seconds: secondsUntilCheck,
          repeats: true,
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        },
        identifier: 'daily-check'
      });

      console.log('Scheduled daily check for:', nextCheck);
    } catch (error) {
      console.error('Error scheduling daily check:', error);
    }
  };

  // Load saved data on app start
  useEffect(() => {
    loadSavedData();
    setupNotifications();
    scheduleDailyCheck();

    // Add listener for daily check notification
    const dailyCheckListener = Notifications.addNotificationReceivedListener(notification => {
      if (notification.request.content.data?.type === 'daily_check') {
        checkAndUpdateNextDoseTime();
      }
    });

    return () => {
      cleanup();
      Notifications.removeNotificationSubscription(dailyCheckListener);
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
        const savedEnableDoseIntervals = await AsyncStorage.getItem(STORAGE_KEYS.ENABLE_DOSE_INTERVALS);
        const savedEnableRecurringReminders = await AsyncStorage.getItem(STORAGE_KEYS.ENABLE_RECURRING_REMINDERS);
        
        if (savedFirstDoseTime) setFirstDoseTime(new Date(savedFirstDoseTime));
        if (savedDoseInterval) {
          const [hours, minutes] = savedDoseInterval.split(':').map(Number);
          setDoseIntervalTensHours(Math.floor(hours / 10));
          setDoseIntervalHours(hours % 10);
          setDoseIntervalTensMinutes(Math.floor(minutes / 10));
          setDoseIntervalMinutes(minutes % 10);
        }
        if (savedNextDoseTime) {
          const nextDose = new Date(savedNextDoseTime);
          setNextDoseTime(nextDose);
          setNextReminderTime(nextDose);
        }
        if (savedEnableDoseIntervals !== null) {
          setEnableDoseIntervals(savedEnableDoseIntervals === 'true');
        }
        if (savedEnableRecurringReminders !== null) {
          setEnableRecurringReminders(savedEnableRecurringReminders === 'true');
        }
        
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
    // Clear any existing notifications when app opens
    await Notifications.dismissAllNotificationsAsync();
    
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
      // Check if interval is 00:00 and disable dose intervals if so
      const totalHours = (doseIntervalTensHours * 10) + (doseIntervalHours || 0);
      const totalMinutes = (doseIntervalTensMinutes * 10) + (doseIntervalMinutes || 0);
      if (totalHours === 0 && totalMinutes === 0) {
        setEnableDoseIntervals(false);
      }

      // Check if first dose time is earlier than current time
      const now = new Date();
      let adjustedFirstDoseTime = new Date(firstDoseTime);
      
      // If first dose time is earlier than current time, schedule for tomorrow
      if (adjustedFirstDoseTime.getTime() < now.getTime()) {
        adjustedFirstDoseTime.setDate(adjustedFirstDoseTime.getDate() + 1);
      }
      
      // Save setup data
      await AsyncStorage.setItem(STORAGE_KEYS.SETUP_COMPLETE, 'true');
      await AsyncStorage.setItem(STORAGE_KEYS.FIRST_DOSE_TIME, adjustedFirstDoseTime.toISOString());
      await AsyncStorage.setItem(STORAGE_KEYS.DOSE_INTERVAL, `${totalHours}:${totalMinutes}`);
      await AsyncStorage.setItem(STORAGE_KEYS.ENABLE_DOSE_INTERVALS, enableDoseIntervals.toString());
      await AsyncStorage.setItem(STORAGE_KEYS.ENABLE_RECURRING_REMINDERS, enableRecurringReminders.toString());
      
      // Schedule the first notification
      const nextDose = calculateNextDoseTime(adjustedFirstDoseTime, 0);
      await scheduleNextDose(nextDose);
      
      // Update app state
      setIsSetupComplete(true);
      setIsUpdatingSetup(false);
      setNextDoseTime(nextDose);
      setNextReminderTime(nextDose);
      setFirstDoseTime(adjustedFirstDoseTime);
    } catch (error) {
      console.error('Error saving setup data:', error);
    }
  };

  // Calculate the next dose time
  const calculateNextDoseTime = (baseTime: Date, intervalMultiplier: number = 1): Date => {
    const nextTime = new Date(baseTime);
    const totalHours = (doseIntervalTensHours * 10) + (doseIntervalHours || 0);
    const totalMinutes = (doseIntervalTensMinutes * 10) + (doseIntervalMinutes || 0);
    nextTime.setHours(nextTime.getHours() + (totalHours * intervalMultiplier));
    nextTime.setMinutes(nextTime.getMinutes() + (totalMinutes * intervalMultiplier));
    return nextTime;
  };

  // Schedule the next medication dose notification
  const scheduleNextDose = async (doseTime: Date) => {
    try {
      // Cancel existing notifications
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Save the next dose time and set reminder time to match
      await AsyncStorage.setItem(STORAGE_KEYS.NEXT_DOSE_TIME, doseTime.toISOString());
      setNextDoseTime(doseTime);
      setNextReminderTime(doseTime);
      
      // Get current time
      const now = new Date();
      
      // Determine if dose time is in the past
      const isPastDue = doseTime.getTime() < now.getTime();
      
      // Calculate seconds until scheduled time
      const scheduledTime = (doseTime.getTime() - now.getTime()) / 1000;
      
      // Schedule main notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: isPastDue ? "TAKE NOW: Medication Reminder" : "Medication Reminder",
          body: isPastDue ? "Your medication is past due - please take now" : "It's time to take your medication",
          data: {
            type: 'medication_reminder',
            timestamp: doseTime.getTime(),
            isPastDue: isPastDue
          },
          categoryIdentifier: 'medication',
        },
        trigger: {
          seconds: scheduledTime > 0 ? scheduledTime : 1, // Schedule immediately if in past
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        },
      });
      
      // Schedule repeating reminder (every 2 minutes)
      scheduleRepeatingReminders(doseTime);
      
      console.log('Next dose scheduled for:', doseTime, isPastDue ? '(Past Due)' : '');
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  };

  // Schedule repeating reminders (every 2 minutes) until user responds
  const scheduleRepeatingReminders = async (initialDoseTime: Date) => {
    try {
      // If recurring reminders are disabled, don't schedule any
      if (!enableRecurringReminders) {
        return;
      }

      // Get current time once to ensure consistency
      const now = new Date();
      
      // Schedule reminders every 2 minutes for up to 1 hour (30 reminders max)
      for (let i = 1; i <= 30; i++) {
        const reminderTime = new Date(initialDoseTime);
        reminderTime.setMinutes(reminderTime.getMinutes() + (i * 2));

        // Calculate seconds until scheduled time
        const scheduledTime = (reminderTime.getTime() - now.getTime()) / 1000;
        
        // Schedule the reminder if it's in the future
        if (scheduledTime > 0) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "REMINDER: Take your medication",
              body: "You still need to take your medication",
              data: {
                type: 'medication_reminder_repeat',
                timestamp: initialDoseTime.getTime(),
                repeatCount: i
              },
              categoryIdentifier: 'medication',
            },
            trigger: {
              seconds: scheduledTime,
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            },
          });
        }
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
      // Use the scheduled (next dose) time (or fallback to "now" if nextDoseTime is null)
      const baseTime = nextDoseTime || new Date();
      const nextDose = calculateNextDoseTime(baseTime);
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
      const intervalMs = ((doseIntervalTensHours * 10 + (doseIntervalHours || 0)) * 60 * 60 * 1000) + 
                         ((doseIntervalTensMinutes * 10 + (doseIntervalMinutes || 0)) * 60 * 1000);
      
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
      
      // Calculate new reminder time
      const newReminderTime = new Date();
      newReminderTime.setMinutes(newReminderTime.getMinutes() + snoozeMinutes);
      setNextReminderTime(newReminderTime);
      
      // Schedule the snoozed notification
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
      
      // Schedule repeating reminders starting from the original scheduled time
      if (nextDoseTime) {
        scheduleRepeatingReminders(nextDoseTime);
      }
      
      console.log('Reminder snoozed until:', newReminderTime);
    } catch (error) {
      console.error('Error handling snooze:', error);
    }
  };

  // Handle cancel reminders
  const handleCancelReminders = async () => {
    try {
      // Cancel all notifications
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Clear next dose time and reminder time
      setNextDoseTime(null);
      setNextReminderTime(null);
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
      setDoseIntervalTensHours(0);
      setDoseIntervalHours(0);
      setDoseIntervalTensMinutes(0);
      setDoseIntervalMinutes(0);
      setNextDoseTime(null);
      setNextReminderTime(null);
      
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

  // Handle medication taken at specific time
  const handleMedicationTakenAtTime = async (takenTime: Date) => {
    try {
      // Cancel current reminders
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Calculate next dose from the taken time
      const nextDose = calculateNextDoseTime(takenTime);
      await scheduleNextDose(nextDose);
      
      console.log('Medication marked as taken at:', takenTime);
    } catch (error) {
      console.error('Error handling medication taken at time:', error);
    }
  };

  // Handle time picker change for taken time
  const onTakenTimeChange = (event: any, selectedTime?: Date) => {
    setShowTakenTimePicker(false);
    if (selectedTime) {
      handleMedicationTakenAtTime(selectedTime);
    }
  };

  // Handle setting next schedule time
  const handleSetNextSchedule = async (selectedTime: Date) => {
    try {
      const now = new Date();
      const scheduledTime = new Date(selectedTime);
      
      // If the selected time is in the past, schedule for tomorrow
      if (scheduledTime.getTime() < now.getTime()) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }
      
      // Schedule the next dose
      await scheduleNextDose(scheduledTime);
      
      console.log('Next schedule set to:', scheduledTime);
    } catch (error) {
      console.error('Error setting next schedule:', error);
    }
  };

  // Handle time picker change for next schedule
  const onNextScheduleTimeChange = (event: any, selectedTime?: Date) => {
    setShowNextSchedulePicker(false);
    if (selectedTime) {
      handleSetNextSchedule(selectedTime);
    }
  };

  // Interval adjustment functions
  const adjustTensHours = (increment: boolean) => {
    setDoseIntervalTensHours(prev => {
      const newValue = increment ? prev + 1 : prev - 1;
      return Math.max(0, Math.min(2, newValue));
    });
  };

  const adjustHours = (increment: boolean) => {
    setDoseIntervalHours(prev => {
      const newValue = increment ? (prev || 0) + 1 : (prev || 0) - 1;
      return Math.max(0, Math.min(9, newValue));
    });
  };

  const adjustTensMinutes = (increment: boolean) => {
    setDoseIntervalTensMinutes(prev => {
      const newValue = increment ? prev + 1 : prev - 1;
      return Math.max(0, Math.min(5, newValue));
    });
  };

  const adjustMinutes = (increment: boolean) => {
    setDoseIntervalMinutes(prev => {
      const newValue = increment ? (prev || 0) + 1 : (prev || 0) - 1;
      return Math.max(0, Math.min(9, newValue));
    });
  };

  // Navigate to setup screen
  const navigateToSetup = () => {
    setIsUpdatingSetup(true);
    setIsSetupComplete(false);
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
        <Text style={styles.title}>
          {isUpdatingSetup ? 'Update Reminder Settings' : 'Medication Reminder Setup'}
        </Text>
        
        <View style={styles.setupSection}>
          <Text style={styles.label}>Time of First Daily Reminder:</Text>
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
          <View style={styles.toggleContainer}>
            <View>
              <Text style={styles.label}>Enable Recurring Reminders</Text>
              <Text style={styles.toggleDescription}>Keeps reminding every 2 minutes</Text>
            </View>
            <Switch
              value={enableRecurringReminders}
              onValueChange={setEnableRecurringReminders}
              trackColor={{ false: '#767577', true: '#4A35A7' }}
              thumbColor={enableRecurringReminders ? '#f4f3f4' : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.setupSection}>
          <View style={styles.toggleContainer}>
            <View>
              <Text style={styles.label}>Enable Dose Intervals</Text>
              <Text style={styles.toggleDescription}>Schedules your next reminder after each dose</Text>
            </View>
            <Switch
              value={enableDoseIntervals}
              onValueChange={setEnableDoseIntervals}
              trackColor={{ false: '#767577', true: '#4A35A7' }}
              thumbColor={enableDoseIntervals ? '#f4f3f4' : '#f4f3f4'}
            />
          </View>
        </View>
        
        {enableDoseIntervals && (
          <View style={styles.setupSection}>
            <Text style={styles.label}>Time between doses (HH:MM):</Text>
            <View style={styles.intervalContainer}>
              <View style={styles.intervalColumn}>
                <TouchableOpacity 
                  style={styles.intervalButton}
                  onPress={() => adjustTensHours(true)}
                >
                  <Text style={styles.intervalButtonText}>+</Text>
                </TouchableOpacity>
                <Text style={styles.intervalDigit}>{doseIntervalTensHours}</Text>
                <TouchableOpacity 
                  style={styles.intervalButton}
                  onPress={() => adjustTensHours(false)}
                >
                  <Text style={styles.intervalButtonText}>-</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.intervalColumn}>
                <TouchableOpacity 
                  style={styles.intervalButton}
                  onPress={() => adjustHours(true)}
                >
                  <Text style={styles.intervalButtonText}>+</Text>
                </TouchableOpacity>
                <Text style={styles.intervalDigit}>{doseIntervalHours ?? '-'}</Text>
                <TouchableOpacity 
                  style={styles.intervalButton}
                  onPress={() => adjustHours(false)}
                >
                  <Text style={styles.intervalButtonText}>-</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.intervalSeparator}>:</Text>

              <View style={styles.intervalColumn}>
                <TouchableOpacity 
                  style={styles.intervalButton}
                  onPress={() => adjustTensMinutes(true)}
                >
                  <Text style={styles.intervalButtonText}>+</Text>
                </TouchableOpacity>
                <Text style={styles.intervalDigit}>{doseIntervalTensMinutes}</Text>
                <TouchableOpacity 
                  style={styles.intervalButton}
                  onPress={() => adjustTensMinutes(false)}
                >
                  <Text style={styles.intervalButtonText}>-</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.intervalColumn}>
                <TouchableOpacity 
                  style={styles.intervalButton}
                  onPress={() => adjustMinutes(true)}
                >
                  <Text style={styles.intervalButtonText}>+</Text>
                </TouchableOpacity>
                <Text style={styles.intervalDigit}>{doseIntervalMinutes ?? '-'}</Text>
                <TouchableOpacity 
                  style={styles.intervalButton}
                  onPress={() => adjustMinutes(false)}
                >
                  <Text style={styles.intervalButtonText}>-</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={completeSetup}
        >
          <Text style={styles.buttonText}>
            {isUpdatingSetup ? 'Update Settings' : 'Start Reminders'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main app screen (after setup)
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ADHDose</Text>
      <Text style={styles.subtitle}>Medication Reminder</Text>
      <Text style={styles.betaNote}>🧪 Beta Testing - Feedback is Welcome!</Text>
      
      <View style={styles.infoSection}>
        <Text style={styles.label}>Initial Daily Reminder:</Text>
        <Text style={styles.infoText}>
          {firstDoseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      
      {enableDoseIntervals && (
        <View style={styles.infoSection}>
          <Text style={styles.label}>Dose interval:</Text>
          <Text style={styles.infoText}>
            {`${(doseIntervalTensHours * 10 + (doseIntervalHours || 0)).toString().padStart(2, '0')}:${(doseIntervalTensMinutes * 10 + (doseIntervalMinutes || 0)).toString().padStart(2, '0')}`}
          </Text>
        </View>
      )}
      
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

      {nextReminderTime && nextReminderTime.getTime() !== nextDoseTime?.getTime() && (
        <View style={[styles.infoSection, { backgroundColor: '#fff3cd' }]}>
          <Text style={styles.label}>Next reminder:</Text>
          <Text style={styles.infoText}>
            {nextReminderTime.toLocaleString([], { 
              hour: '2-digit', 
              minute: '2-digit',
              month: 'short',
              day: 'numeric' 
            })}
          </Text>
        </View>
      )}
      
      <View style={styles.buttonContainer}>
        {enableDoseIntervals && (
          <>
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

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => setShowTakenTimePicker(true)}
            >
              <Text style={styles.buttonText}>Taken - Interval from Selected Time</Text>
            </TouchableOpacity>
          </>
        )}
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => setShowNextSchedulePicker(true)}
        >
          <Text style={styles.buttonText}>Set next schedule to</Text>
        </TouchableOpacity>
        
        {showTakenTimePicker && (
          <DateTimePicker
            value={new Date()}
            mode="time"
            is24Hour={false}
            onChange={onTakenTimeChange}
            display="spinner"
          />
        )}

        {showNextSchedulePicker && (
          <DateTimePicker
            value={new Date()}
            mode="time"
            is24Hour={false}
            onChange={onNextScheduleTimeChange}
            display="spinner"
          />
        )}
        
        {nextDoseTime && nextDoseTime.getTime() < new Date().getTime() && (
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
        )}
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.cancelButton]}
          onPress={() => handleLastDoseForDay()}
        >
          <Text style={styles.buttonText}>No More Reminders Today</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: '#777' }]}
          onPress={navigateToSetup}
        >
          <Text style={styles.buttonText}>Update Initial Reminder</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.feedbackButton]}
          onPress={() => WebBrowser.openBrowserAsync('https://forms.gle/T69TKKs1ojSyuyzr8')}
        >
          <Text style={styles.buttonText}>💬 Send Feedback</Text>
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 4,
    textAlign: 'center',
  },
  betaNote: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#888',
    marginBottom: 20,
    textAlign: 'center',
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
  intervalColumn: {
    alignItems: 'center',
    marginHorizontal: 5,
  },
  intervalButton: {
    backgroundColor: '#4A35A7',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  intervalButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  intervalDigit: {
    fontSize: 24,
    fontWeight: 'bold',
    minWidth: 20,
    textAlign: 'center',
    marginVertical: 4,
  },
  intervalSeparator: {
    fontSize: 24,
    marginHorizontal: 10,
    fontWeight: 'bold',
    alignSelf: 'center',
  },
  primaryButton: {
    backgroundColor: '#4A35A7',
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
    backgroundColor: '#4A35A7',
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
  feedbackButton: {
    backgroundColor: '#4CAF50',
    marginTop: 20,
    marginBottom: 10,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
  },
  toggleDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});
