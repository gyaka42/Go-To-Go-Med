import { Link, Stack } from "expo-router";
import { StyleSheet, View, Text } from "react-native";
import i18n from "../utils/i18n";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Text style={styles.title}>{i18n.t("notFound")}</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>{i18n.t("goHome")}</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    color: "#0a7ea4",
    fontSize: 16,
  },
});
