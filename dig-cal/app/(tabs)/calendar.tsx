import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View, Text, Button, Modal, TextInput, Alert, useColorScheme } from 'react-native';
import { CalendarList } from 'react-native-calendars';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Colors } from '@/constants/theme';

interface DateObject {
  dateString: string;
}

// Keep existing themed components to preserve app styling
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

// Don't commit secrets!
const CLIENT_ID = process.env.EXPO_GOOGLE_CLIENT_ID || '742911455880-f1tmfj8gi0hepinn1fkkg1jbbdqr7u0i.apps.googleusercontent.com'; 
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

WebBrowser.maybeCompleteAuthSession();

export default function TabTwoScreen() {
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: SCOPES,
      responseType: AuthSession.ResponseType.Token,
      redirectUri: AuthSession.makeRedirectUri(),
      usePKCE: false,
    },
    { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' }
  );

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventsByDate, setEventsByDate] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (response?.type === 'success') {
      const token = (response as any).params?.access_token || (response as any).params?.id_token;
      setAccessToken(token);
      // After sign-in, fetch events for primary calendar (example)
      fetchEvents(token);
    }
  }, [response]);

  const markings = useMemo(() => {
    const marks: Record<string, any> = {};
    Object.keys(eventsByDate).forEach((date) => {
      marks[date] = { marked: true, dotColor: '#2E86AB' };
    });
    if (selectedDate) marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true };
    return marks;
  }, [eventsByDate, selectedDate]);

  async function signInWithGoogle() {
    try {
      await promptAsync();
    } catch (err) {
      Alert.alert('Auth error', String(err));
    }
  }

  async function fetchEvents(token: string | null) {
    if (!token) return;
    try {
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=250', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const grouped: Record<string, any[]> = {};
      (data.items || []).forEach((item: any) => {
        const date = (item.start?.date || item.start?.dateTime || '').split('T')[0];
        if (!date) return;
        grouped[date] = grouped[date] || [];
        grouped[date].push(item);
      });
      setEventsByDate(grouped);
    } catch (err) {
      console.warn('fetchEvents error', err);
    }
  }

  async function createEventOnGoogle(date: string, title: string) {
    if (!accessToken) {
      Alert.alert('Not signed in', 'Please sign in with Google first');
      return;
    }
    try {
      const event = {
        summary: title,
        start: { date },
        end: { date },
      };
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
      const data = await res.json();
      if (data.error) {
        Alert.alert('Error creating event', data.error.message || JSON.stringify(data));
      } else {
        // refresh events
        await fetchEvents(accessToken);
        setModalVisible(false);
        setEventTitle('');
        Alert.alert('Event created');
      }
    } catch (err) {
      Alert.alert('Create error', String(err));
    }
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={<IconSymbol size={180} color="#808080" name="calendar" style={styles.headerImage} />}
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" style={{ fontFamily: Fonts.rounded }}>Calendar</ThemedText>
      </ThemedView>

      {!accessToken ? (
        <View style={{ margin: 12 }}>
          <Text style={{ marginBottom: 8, color: colors.text }}>Sign in to sync with Google Calendar</Text>
          <Button title="Sign in with Google" onPress={signInWithGoogle} disabled={!request} />
          <Text style={{ marginTop: 8, color: colors.text }}>
            After signing in, events from your primary Google Calendar will be fetched and displayed.
          </Text>
        </View>
      ) : (
        <View style={{ margin: 8 }}>
          <Text style={{ marginBottom: 6, color: colors.text }}>Signed in. Tap a date to add an event.</Text>
        </View>
      )}

      <CalendarList
        horizontal
        pagingEnabled
        pastScrollRange={12}
        futureScrollRange={12}
        onDayPress={(day: DateObject) => {
          setSelectedDate(day.dateString);
        }}
        markedDates={markings}
        style={{ marginBottom: 20 }}
      />

      {selectedDate && (
        <View style={{ paddingHorizontal: 12, marginBottom: 12 }}>
          <Button title={`Add event for ${selectedDate}`} onPress={() => setModalVisible(true)} />
        </View>
      )}

      <View style={{ padding: 12 }}>
        {selectedDate && (
          <Text style={{ fontWeight: '600', color: colors.text }}>Events on {selectedDate}:</Text>
        )}
        {(selectedDate && (eventsByDate[selectedDate] || []).length === 0) && (
          <Text style={{ color: colors.text }}>No events</Text>
        )}
        {selectedDate && (eventsByDate[selectedDate] || []).map((ev) => (
          <View key={ev.id} style={{ paddingVertical: 8 }}>
            <Text style={{ fontWeight: '500', color: colors.text }}>{ev.summary}</Text>
            <Text style={{ color: colors.text }}>{ev.start?.date || ev.start?.dateTime}</Text>
          </View>
        ))}
      </View>

      <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 16, color: colors.text }}>Create event on {selectedDate}</Text>
            <TextInput placeholder="Event title" placeholderTextColor={colors.secondaryText} value={eventTitle} onChangeText={setEventTitle} style={{ borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 16, borderRadius: 8, color: colors.text, backgroundColor: colors.background }} />
            <Button title="Create (Google Calendar)" onPress={() => selectedDate && createEventOnGoogle(selectedDate, eventTitle || 'New event')} color={colors.button} />
            <View style={{ height: 12 }} />
            <Button title="Close" onPress={() => setModalVisible(false)} color={colors.secondaryText} />
          </View>
        </View>
      </Modal>

    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -40,
    left: -15,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
});
