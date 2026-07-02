// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Notes {

    struct Note {
        address author;
        string text;
        uint256 timestamp;
    }

    Note[] private notes;

    event NoteCreated(
        address indexed author,
        string text,
        uint256 timestamp
    );

    function createNote(string calldata text) external {

        require(bytes(text).length > 0, "Empty note");

        notes.push(
            Note(
                msg.sender,
                text,
                block.timestamp
            )
        );

        emit NoteCreated(
            msg.sender,
            text,
            block.timestamp
        );
    }

    function getNote(uint index)
        external
        view
        returns(
            address,
            string memory,
            uint256
        )
    {
        Note memory n = notes[index];

        return (
            n.author,
            n.text,
            n.timestamp
        );
    }

    function getTotalNotes()
        external
        view
        returns(uint)
    {
        return notes.length;
    }
}
