"""Simple CLI program for maintaining a family playlist."""
from pathlib import Path

PLAYLIST_FILE = Path("playlist.dat")


def main() -> None:
    print("\nWelcome to The Family Playlist!")
    print("Keep track of every favorite tune in one place.\n")

    while True:
        print("Choose an option:")
        print("  1. Add songs to the playlist")
        print("  2. View existing playlist")
        print("  3. Exit")

        choice = input("Enter 1, 2, or 3: ").strip()
        if choice == "1":
            add_songs()
        elif choice == "2":
            show_playlist()
        elif choice == "3":
            print("Goodbye! Keep the music playing!")
            break
        else:
            print("Invalid choice. Please enter 1, 2, or 3.\n")


def add_songs() -> None:
    print("\nEnter song titles one at a time. Press Enter on an empty line when finished.\n")
    new_entries: list[str] = []

    while True:
        song = input("Song title: ").strip()
        if not song:
            break
        new_entries.append(song)

    if not new_entries:
        print("No songs were added. Returning to the menu.\n")
        return

    with PLAYLIST_FILE.open("a", encoding="utf-8") as playlist:
        for entry in new_entries:
            playlist.write(f"{entry}\n")

    print(f"Added {len(new_entries)} song(s) to the playlist!\n")


def show_playlist() -> None:
    if not PLAYLIST_FILE.exists():
        print("\nNo playlist found yet. Add some songs first!\n")
        return

    with PLAYLIST_FILE.open("r", encoding="utf-8") as playlist:
        songs = [line.strip() for line in playlist if line.strip()]

    if not songs:
        print("\nYour playlist file is empty. Add some songs!\n")
        return

    print("\nYour Family Playlist:")
    for idx, song in enumerate(songs, start=1):
        print(f"  {idx}. {song}")
    print()


if __name__ == "__main__":
    main()
