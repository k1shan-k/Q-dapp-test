// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Voting {

    struct Proposal {
        address creator;
        string title;
        string description;
        uint256 createdAt;
        uint256 voteCount;
    }

    Proposal[] private proposals;

    // proposalId => voter => number of votes cast by that voter.
    // Testnet only: wallets may vote as many times as they like, this
    // mapping is informational (per-voter tally) and not a one-vote cap.
    mapping(uint256 => mapping(address => uint256)) private voterTally;

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed creator,
        string title,
        uint256 timestamp
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        uint256 voteCount,
        uint256 timestamp
    );

    function createProposal(string calldata title, string calldata description) external {

        require(bytes(title).length > 0, "Empty title");

        proposals.push(
            Proposal(
                msg.sender,
                title,
                description,
                block.timestamp,
                0
            )
        );

        emit ProposalCreated(
            proposals.length - 1,
            msg.sender,
            title,
            block.timestamp
        );
    }

    function vote(uint256 proposalId) external {

        require(proposalId < proposals.length, "Invalid proposal");

        proposals[proposalId].voteCount += 1;
        voterTally[proposalId][msg.sender] += 1;

        emit VoteCast(
            proposalId,
            msg.sender,
            proposals[proposalId].voteCount,
            block.timestamp
        );
    }

    function getProposal(uint256 index)
        external
        view
        returns (
            address creator,
            string memory title,
            string memory description,
            uint256 createdAt,
            uint256 voteCount
        )
    {
        Proposal memory p = proposals[index];

        return (
            p.creator,
            p.title,
            p.description,
            p.createdAt,
            p.voteCount
        );
    }

    function getTotalProposals() external view returns (uint256) {
        return proposals.length;
    }

    function getVotesCastBy(uint256 proposalId, address voter) external view returns (uint256) {
        return voterTally[proposalId][voter];
    }
}
