-- The VLC/MPC connection (and everything that used it: following its playback position, the
-- video-transcription pipeline built on top of that) was removed - only the LouvorJA connection
-- is kept. Nothing reads or writes this table any more.

DROP TABLE external_player_connections;
