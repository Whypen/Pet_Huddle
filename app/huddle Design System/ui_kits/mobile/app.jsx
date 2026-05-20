/* global React, ReactDOM, IOSFrame, HomeScreen, AuthScreen, ChatsScreen, AlertsScreen, PremiumScreen, DiscoverScreen, YouScreen, BottomNav */
const { useState } = React;

function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState("home"); // home | discover | alerts | chats | you
  const [overlay, setOverlay] = useState(null); // "premium" | null

  const go = (dest) => {
    if (dest === "premium") setOverlay("premium");
    else if (dest === "home") { setOverlay(null); setTab("home"); }
    else setTab(dest);
  };

  let screen;
  if (!signedIn) {
    screen = <AuthScreen go={go} onSignIn={() => setSignedIn(true)} />;
  } else if (overlay === "premium") {
    screen = <PremiumScreen go={go} />;
  } else {
    switch (tab) {
      case "home":     screen = <HomeScreen go={go} />; break;
      case "discover": screen = <DiscoverScreen />; break;
      case "alerts":   screen = <AlertsScreen go={go} />; break;
      case "chats":    screen = <ChatsScreen go={go} />; break;
      case "you":      screen = <YouScreen go={go} onSignOut={() => { setSignedIn(false); setTab("home"); }} />; break;
      default:         screen = <HomeScreen go={go} />;
    }
  }

  const showNav = signedIn && !overlay;

  return (
    <IOSDevice>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
        <div style={{ height: 54, flex: "0 0 54px" }} />
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {screen}
        </div>
        {showNav && <BottomNav active={tab} onChange={(t) => { setOverlay(null); setTab(t); }} />}
        <div style={{ height: 34, flex: "0 0 34px" }} />
      </div>
    </IOSDevice>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
